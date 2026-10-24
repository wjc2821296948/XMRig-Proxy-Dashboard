import { test } from "node:test";
import assert from "node:assert/strict";
import { registerManualRefresh } from "../src/manual-refresh.js";

class FakeButton extends EventTarget {
  id = "";
  type = "";
  className = "";
  textContent = "";
  title = "";
  disabled = false;
  attributes = {};
  removed = false;
  setAttribute(name, value) { this.attributes[name] = value; }
  remove() { this.removed = true; }
  click() { this.dispatchEvent(new Event("click")); }
}

function setup(options = {}) {
  const button = new FakeButton();
  const container = {
    children: [],
    appendChild(node) { this.children.push(node); },
  };
  const messages = [];
  const cleanup = registerManualRefresh({
    documentRef: { createElement: () => button },
    container,
    hasConfig: options.hasConfig ?? (() => true),
    shouldRefresh: options.shouldRefresh ?? (() => true),
    refresh: options.refresh ?? (() => {}),
    notify: (message, type) => messages.push({ message, type }),
  });
  return { button, container, messages, cleanup };
}

test("manual refresh requires a saved connection and read-only mode", () => {
  const disconnected = setup({ hasConfig: () => false });
  disconnected.button.click();
  assert.equal(disconnected.messages[0].type, "warning");

  const wrongMode = setup({ shouldRefresh: () => false });
  wrongMode.button.click();
  assert.match(wrongMode.messages[0].message, /只读视图/);
});

test("manual refresh disables the button until the refresh settles", async () => {
  let release;
  let calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const { button } = setup({ refresh: async () => { calls += 1; await pending; } });
  button.click();
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "刷新中…");
  button.click();
  assert.equal(calls, 1);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "立即刷新");
});

test("manual refresh removes its listener and button on cleanup", () => {
  let calls = 0;
  const { button, cleanup } = setup({ refresh: () => { calls += 1; } });
  cleanup();
  assert.equal(button.removed, true);
  button.click();
  assert.equal(calls, 0);
});
