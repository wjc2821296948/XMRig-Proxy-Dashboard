import { test } from "node:test";
import assert from "node:assert/strict";
import { registerVisibilityRefresh } from "../src/visibility-refresh.js";

class TestDocument extends EventTarget {
  visibilityState = "hidden";
}

test("visibility refresh ignores hidden documents and missing configuration", () => {
  const documentRef = new TestDocument();
  let configured = false;
  let refreshes = 0;
  registerVisibilityRefresh({
    documentRef,
    hasConfig: () => configured,
    refresh: () => { refreshes += 1; },
  });

  documentRef.dispatchEvent(new Event("visibilitychange"));
  documentRef.visibilityState = "visible";
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(refreshes, 0);

  configured = true;
  documentRef.visibilityState = "hidden";
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(refreshes, 0);

  documentRef.visibilityState = "visible";
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(refreshes, 1);
});

test("visibility refresh respects dashboard mode and unregisters cleanly", () => {
  const documentRef = new TestDocument();
  let readonly = false;
  let refreshes = 0;
  const cleanup = registerVisibilityRefresh({
    documentRef,
    hasConfig: () => true,
    shouldRefresh: () => readonly,
    refresh: () => { refreshes += 1; },
  });

  documentRef.visibilityState = "visible";
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(refreshes, 0);

  readonly = true;
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(refreshes, 1);

  cleanup();
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(refreshes, 1);
});
