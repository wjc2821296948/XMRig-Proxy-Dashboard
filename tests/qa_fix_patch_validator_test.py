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
        patch = """diff --git a/src/alert-rules.js b/src/alert-rules.js
index 1111111..2222222 100644
--- a/src/alert-rules.js
+++ b/src/alert-rules.js
@@ -1 +1 @@
-const oldValue = 1;
+const newValue = 2;
"""
        self.assertEqual(self.validate_text(patch), ["src/alert-rules.js"])

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
