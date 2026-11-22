import importlib.util
import io
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parents[1] / ".github/scripts/qa-fix-agent.py"
SPEC = importlib.util.spec_from_file_location("qa_fix_agent", SCRIPT)
FIX_AGENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FIX_AGENT)


class Response:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit=-1):
        return self.body


class FixAgentTests(unittest.TestCase):
    def test_loads_valid_issue_and_report_context(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "context.json"
            path.write_text(json.dumps({"issue": {"number": 140}, "report": "QA report"}), encoding="utf-8")
            issue, report = FIX_AGENT.load_context(path)
        self.assertEqual(issue["number"], 140)
        self.assertEqual(report, "QA report")

    def test_rejects_invalid_or_incomplete_context(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "context.json"
            path.write_text("not json", encoding="utf-8")
            with self.assertRaisesRegex(SystemExit, "invalid JSON"):
                FIX_AGENT.load_context(path)
            path.write_text(json.dumps({"issue": [], "report": ""}), encoding="utf-8")
            with self.assertRaisesRegex(SystemExit, "issue object"):
                FIX_AGENT.load_context(path)

    def test_extracts_patch_from_chat_completion(self):
        patch = "diff --git a/src/a.js b/src/a.js\n+++ b/src/a.js\n"
        body = json.dumps({"choices": [{"message": {"content": f"```diff\n{patch}```"}}]}).encode()
        self.assertEqual(FIX_AGENT.extract_patch(body), patch.strip())

    def test_rejects_malformed_and_incomplete_model_responses(self):
        for body in (b"not json", b"{}", json.dumps({"choices": [{"message": {"content": 42}}]}).encode()):
            with self.subTest(body=body), self.assertRaises(SystemExit):
                FIX_AGENT.extract_patch(body)
        safe_decline = json.dumps({"choices": [{"message": {"content": "NO_SAFE_PATCH"}}]}).encode()
        with self.assertRaisesRegex(SystemExit, "declined"):
            FIX_AGENT.extract_patch(safe_decline)

    def test_reports_http_status_without_echoing_response_body(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.HTTPError(
            "https://litellm.lrate.top/v1/chat/completions", 401, "Unauthorized", {}, io.BytesIO(b"secret response body")
        )
        with self.assertRaisesRegex(SystemExit, "HTTP 401") as caught:
            FIX_AGENT.request_patch(Mock(), opener=opener)
        self.assertNotIn("secret response body", str(caught.exception))

    def test_redirect_handler_refuses_redirects(self):
        handler = FIX_AGENT.NoRedirectHandler()
        self.assertIsNone(handler.redirect_request(Mock(), Mock(), 302, "Found", {}, "https://other.example/"))

    def test_reports_network_errors_cleanly(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.URLError("network down")
        with self.assertRaisesRegex(SystemExit, "Unable to reach"):
            FIX_AGENT.request_patch(Mock(), opener=opener)

    def test_rejects_unsafe_and_renamed_patch_paths(self):
        for old, new in (("../README.md", "../README.md"), ("src/a.js", "src/b.js"), ("src\\a.js", "src\\a.js")):
            patch = f"diff --git a/{old} b/{new}\n+++ b/{new}\n"
            with self.subTest(path=new), self.assertRaises(SystemExit):
                FIX_AGENT.validate_patch_text(patch)

    def test_accepts_a_minimal_in_place_source_patch(self):
        patch = "diff --git a/src/keyboard-shortcuts.js b/src/keyboard-shortcuts.js\n+++ b/src/keyboard-shortcuts.js\n"
        self.assertEqual(FIX_AGENT.validate_patch_text(patch), patch)

    def test_rejects_nonexistent_tracked_files(self):
        patch = "diff --git a/src/definitely-not-tracked.js b/src/definitely-not-tracked.js\n+++ b/src/definitely-not-tracked.js\n"
        with self.assertRaisesRegex(SystemExit, "new or untracked file"):
            FIX_AGENT.validate_patch_text(patch)

    def test_requires_existing_regular_working_tree_file(self):
        with tempfile.TemporaryDirectory() as directory:
            regular = Path(directory) / "regular.js"
            regular.write_text("const value = 1;\\n", encoding="utf-8")
            self.assertTrue(FIX_AGENT.is_existing_regular_file(regular))
            self.assertFalse(FIX_AGENT.is_existing_regular_file(regular.with_name("missing.js")))
            link = Path(directory) / "link.js"
            try:
                os.symlink(regular, link)
            except (OSError, NotImplementedError):
                self.skipTest("Symlinks are unavailable on this runner")
            self.assertFalse(FIX_AGENT.is_existing_regular_file(link))

    def test_rejects_tracked_but_missing_working_tree_file(self):
        patch_text = "diff --git a/src/keyboard-shortcuts.js b/src/keyboard-shortcuts.js\n+++ b/src/keyboard-shortcuts.js\n"
        with patch.object(FIX_AGENT, "tracked_regular_files", return_value={"src/keyboard-shortcuts.js"}):
            with patch.object(FIX_AGENT, "is_existing_regular_file", return_value=False):
                with self.assertRaisesRegex(SystemExit, "missing or non-regular"):
                    FIX_AGENT.validate_patch_text(patch_text)


if __name__ == "__main__":
    unittest.main()
