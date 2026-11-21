#!/usr/bin/env python3
"""Validate a model-generated patch against tracked, non-sensitive files only."""
import re
import subprocess
import sys
from pathlib import Path

ALLOWED_ROOTS = ("src/", "tests/", "docs/")
ALLOWED_ROOT_FILES = {"README.md", "README.en.md"}
PROTECTED_FILES = {
    "index.html",
    "src/api.js",
    "src/storage.js",
    "src/public-assets.js",
    "src/ui.js",
    "src/escape-html.js",
    "src/background-upload-guard.js",
    "src/alert-rules.js",
    "src/alert-preferences.js",
    "src/alert-notifications.js",
    "tests/alert-rules.test.js",
    ".github/scripts/validate-qa-fix-patch.py",
}


def fail(message: str) -> None:
    raise SystemExit(message)


def tracked_regular_files() -> set[str]:
    output = subprocess.check_output(["git", "ls-files", "--stage", "-z"])
    tracked = set()
    for entry in output.decode("utf-8", "surrogateescape").split("\0"):
        if not entry:
            continue
        metadata, path = entry.split("\t", 1)
        mode = metadata.split(" ", 1)[0]
        if mode == "100644" or mode == "100755":
            tracked.add(path)
    return tracked


def validate(patch_path: Path) -> list[str]:
    patch = patch_path.read_text(encoding="utf-8")
    if not patch.strip() or "GIT binary patch" in patch or "Binary files " in patch:
        fail("Refusing an empty or binary patch.")

    tracked = tracked_regular_files()
    pairs = re.findall(r"^diff --git a/(.+?) b/(.+?)$", patch, flags=re.MULTILINE)
    if not pairs:
        fail("No standard git diff file headers were found.")

    changed: list[str] = []
    for old_path, new_path in pairs:
        for path in (old_path, new_path):
            parts = Path(path).parts
            if path.startswith("/") or ".." in parts or "\\" in path:
                fail(f"Refusing unsafe patch path: {path}")
            if path not in PROTECTED_FILES and not (path.startswith(ALLOWED_ROOTS) or path in ALLOWED_ROOT_FILES):
                fail(f"Refusing patch outside the allowlist: {path}")
        if old_path != new_path:
            fail(f"Refusing file creation, deletion, rename, or copy: {old_path} -> {new_path}")
        if old_path in PROTECTED_FILES:
            fail(f"Refusing changes to security-sensitive file: {old_path}")
        if old_path not in tracked:
            fail(f"Refusing changes to an untracked or new file: {old_path}")
        if old_path in changed:
            fail(f"Refusing duplicate diff sections for: {old_path}")
        changed.append(old_path)

    for forbidden in ("new file mode ", "deleted file mode ", "old mode ", "new mode ", "rename from ", "rename to ", "copy from ", "copy to "):
        if forbidden in patch:
            fail(f"Refusing patch operation: {forbidden.strip()}")

    old_paths = re.findall(r"^--- a/(.+)$", patch, flags=re.MULTILINE)
    added_paths = re.findall(r"^\+\+\+ b/(.+)$", patch, flags=re.MULTILINE)
    if old_paths != changed or added_paths != changed:
        fail("Patch file headers do not match the declared changed paths.")
    return changed


if __name__ == "__main__":
    if len(sys.argv) != 2:
        fail("Usage: validate-qa-fix-patch.py PATCH_FILE")
    files = validate(Path(sys.argv[1]))
    print(f"Validated patch for {len(files)} existing, non-sensitive file(s).")
