import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / ".github/scripts/validate-qa-fix-patch.py"
SPEC = importlib.util.spec_from_file_location("qa_fix_patch_validator", SCRIPT)
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


class PatchValidatorTests(unittest.TestCase):
    def validate_text(self, text):
        with tempfile.TemporaryDirectory() as directory:
            patch = Path(directory) / "change.patch"
            patch.write_text(text, encoding="utf-8")
            return VALIDATOR.validate(patch)

    def test_accepts_changes_to_existing_non_sensitive_source(self):
        patch = """diff --git a/src/keyboard-shortcuts.js b/src/keyboard-shortcuts.js
index 1111111..2222222 100644
--- a/src/keyboard-shortcuts.js
+++ b/src/keyboard-shortcuts.js
@@ -1 +1 @@
-const oldValue = 1;
+const newValue = 2;
"""
        self.assertEqual(self.validate_text(patch), ["src/keyboard-shortcuts.js"])

    def test_rejects_new_files_even_inside_allowed_directories(self):
        patch = """diff --git a/src/qa-backdoor.js b/src/qa-backdoor.js
new file mode 100644
--- /dev/null
+++ b/src/qa-backdoor.js
@@ -0,0 +1 @@
+export {};
"""
        with self.assertRaisesRegex(SystemExit, "untracked or new file"):
            self.validate_text(patch)

    def test_rejects_security_sensitive_existing_files(self):
        patch = """diff --git a/src/api.js b/src/api.js
index 1111111..2222222 100644
--- a/src/api.js
+++ b/src/api.js
@@ -1 +1 @@
-const oldValue = 1;
+const newValue = 2;
"""
        with self.assertRaisesRegex(SystemExit, "security-sensitive"):
            self.validate_text(patch)


    def test_rejects_alert_engine_tests_and_security_helpers(self):
        protected = [
            "src/main.js",
            "src/alert-rules.js",
            "src/alert-preferences.js",
            "src/alert-notifications.js",
            "src/escape-html.js",
            "src/background-upload-guard.js",
            "tests/alert-rules.test.js",
            ".github/scripts/validate-qa-fix-patch.py",
        ]
        for path in protected:
            patch = f"""diff --git a/{path} b/{path}
index 1111111..2222222 100644
--- a/{path}
+++ b/{path}
@@ -1 +1 @@
-const oldValue = 1;
+const newValue = 2;
"""
            with self.subTest(path=path), self.assertRaisesRegex(SystemExit, "security-sensitive"):
                self.validate_text(patch)

    def test_rejects_renames(self):
        patch = """diff --git a/src/alert-rules.js b/src/alert-rules-copy.js
similarity index 100%
rename from src/alert-rules.js
rename to src/alert-rules-copy.js
--- a/src/alert-rules.js
+++ b/src/alert-rules-copy.js
"""
        with self.assertRaisesRegex(SystemExit, "file creation, deletion, rename"):
            self.validate_text(patch)


if __name__ == "__main__":
    unittest.main()
