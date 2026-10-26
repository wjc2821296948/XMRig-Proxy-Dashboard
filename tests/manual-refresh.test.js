import { test } from "node:test";
import assert from "node:assert/strict";
import { registerManualRefresh } from "../src/manual-refresh.js";

class FakeButton extends EventTarget {
  constructor(tagName = "button") { super(); this.tagName = tagName; }
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
  const created = [];
  const container = {
    children: [],
    appendChild(node) { this.children.push(node); },
  };
  const messages = [];
  const cleanup = registerManualRefresh({
    documentRef: { createElement: tagName => { const element = new FakeButton(tagName); created.push(element); return element; } },
    container,
    hasConfig: options.hasConfig ?? (() => true),
    shouldRefresh: options.shouldRefresh ?? (() => true),
    refresh: options.refresh ?? (() => {}),
    notify: (message, type) => messages.push({ message, type }),
    onRefreshStart: options.onRefreshStart,
    onRefreshEnd: options.onRefreshEnd,
  });
  return { button: created.find(element => element.id === "refreshDashboardButton"), status: created.find(element => element.attributes.role === "status"), container, messages, cleanup };
}

test("manual refresh handles a missing container without throwing", () => {
  const messages = [];
  const warnings = [];
  let created = false;
  const cleanup = registerManualRefresh({
    documentRef: { createElement: () => { created = true; throw new Error("should not create an element"); } },
    container: null,
    hasConfig: () => false,
    refresh() {},
    notify: (message, type) => messages.push({ message, type }),
    warn: message => warnings.push(message),
  });
  assert.equal(typeof cleanup, "function");
  assert.equal(created, false);
  assert.equal(messages.length, 0);
  assert.match(warnings[0], /\.subtitle/);
  cleanup();
});

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
  const { button, status } = setup({ refresh: async () => { calls += 1; await pending; } });
  button.click();
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "刷新中…");
  assert.equal(status.textContent, "正在刷新监控数据");
  assert.equal(button.attributes["aria-busy"], "true");
  assert.equal(button.attributes["aria-disabled"], "true");
  button.click();
  assert.equal(calls, 1);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "立即刷新");
  assert.equal(status.textContent, "监控数据刷新完成");
  assert.equal(button.attributes["aria-busy"], "false");
  assert.equal(button.attributes["aria-disabled"], "false");
});

test("manual refresh announces failure when the refresh handler returns false", async () => {
  const { button, status, messages } = setup({ refresh: async () => false });
  button.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(status.textContent, "手动刷新失败");
  assert.equal(messages.at(-1).type, "error");
  assert.equal(messages.at(-1).message, "手动刷新失败，请检查 Proxy 连接");
  assert.equal(button.disabled, false);
});

test("manual refresh removes its listener, button, and status region on cleanup", () => {
  let calls = 0;
  const { button, status, cleanup } = setup({ refresh: () => { calls += 1; } });
  cleanup();
  assert.equal(button.removed, true);
  assert.equal(status.removed, true);
  button.click();
  assert.equal(calls, 0);
});


test("manual refresh pauses and restores automatic polling on success or failure", async () => {
  const events = [];
  const successful = setup({
    onRefreshStart: () => events.push("pause"),
    onRefreshEnd: () => events.push("resume"),
    refresh: () => events.push("refresh"),
  });
  successful.button.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ["pause", "refresh", "resume"]);

  const failedEvents = [];
  const failed = setup({
    onRefreshStart: () => failedEvents.push("pause"),
    onRefreshEnd: () => failedEvents.push("resume"),
    refresh: async () => { throw new Error("network failure"); },
  });
  failed.button.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(failedEvents, ["pause", "resume"]);
  assert.equal(failed.button.disabled, false);
  assert.equal(failed.messages.at(-1).type, "error");
});
