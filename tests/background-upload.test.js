import { test } from "node:test";
import assert from "node:assert/strict";

import { createBackgroundUploadGuard } from "../src/background-upload-guard.js";

test("clearing the background while upload processing is pending ignores its stale result", async () => {
  const guard = createBackgroundUploadGuard();
  let selectedBackground = "https://example.com/current.jpg";
  let resolveEncoding;
  const encoding = new Promise(resolve => {
    resolveEncoding = resolve;
  });
  const requestId = guard.begin();

  const uploadTask = (async () => {
    const encodedImage = await encoding;
    if (!guard.isCurrent(requestId)) return;
    selectedBackground = encodedImage;
  })();

  // Simulate clicking "restore default" before the asynchronous encoder finishes.
  guard.invalidate();
  selectedBackground = "";
  resolveEncoding("data:image/webp;base64,stale-upload");
  await uploadTask;

  assert.equal(selectedBackground, "", "the stale upload must not override the clear action");
});

test("a newer background selection invalidates an earlier pending upload", async () => {
  const guard = createBackgroundUploadGuard();
  let selectedBackground = "";
  let resolveEncoding;
  const encoding = new Promise(resolve => {
    resolveEncoding = resolve;
  });
  const requestId = guard.begin();

  const uploadTask = (async () => {
    const encodedImage = await encoding;
    if (!guard.isCurrent(requestId)) return;
    selectedBackground = encodedImage;
  })();

  guard.invalidate();
  selectedBackground = "https://example.com/new-selection.jpg";
  resolveEncoding("data:image/webp;base64,old-upload");
  await uploadTask;

  assert.equal(selectedBackground, "https://example.com/new-selection.jpg");
});
