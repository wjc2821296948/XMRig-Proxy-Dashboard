import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatBytes,
  formatHashrate,
  formatNumber,
  formatUptime,
  getStatusInfo,
} from "../src/ui.js";
import { escapeHtml } from "../src/escape-html.js";

test("hashrate formatting handles zero, kilo, and mega ranges", () => {
  assert.equal(formatHashrate(0), "0 H/s");
  assert.equal(formatHashrate(42.5), "42.50 KH/s");
  assert.equal(formatHashrate(1000), "1.00 MH/s");
  assert.equal(formatHashrate(2500), "2.50 MH/s");
});

test("byte formatting switches units at binary thresholds", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.00 KB");
  assert.equal(formatBytes(1048576), "1.00 MB");
  assert.equal(formatBytes(1073741824), "1.00 GB");
});

test("uptime formatting drops seconds and carries across days", () => {
  assert.equal(formatUptime(0), "0d 0h 0m");
  assert.equal(formatUptime(3661), "0d 1h 1m");
  assert.equal(formatUptime(90061), "1d 1h 1m");
});

test("number formatting inserts thousands separators", () => {
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(999), "999");
  assert.equal(formatNumber(1234567), "1,234,567");
});

test("basic UI status helper preserves offline and warning boundaries", () => {
  assert.deepEqual(
    getStatusInfo({ now: 0, max: 10 }),
    { cls: "status-offline", text: "离线" },
  );
  assert.deepEqual(
    getStatusInfo({ now: 4, max: 10 }),
    { cls: "status-warning", text: "预警" },
  );
  assert.deepEqual(
    getStatusInfo({ now: 5, max: 10 }),
    { cls: "status-online", text: "在线" },
  );
});


test("toast notifications announce status and have a removal fallback", async () => {
  const { showToast } = await import("../src/ui.js");
  const originalDocument = globalThis.document;
  const originalAnimationFrame = globalThis.requestAnimationFrame;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const nodes = [];

  class FakeElement {
    constructor() {
      this.children = [];
      this.attributes = {};
      this.className = "";
      this.textContent = "";
      this.classList = {
        add() {},
        remove() {},
      };
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    appendChild(child) { child.parentNode = this; this.children.push(child); }
    addEventListener() {}
    remove() {
      this.removed = true;
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this);
    }
  }

  const body = new FakeElement();
  globalThis.document = {
    body,
    createElement() { const element = new FakeElement(); nodes.push(element); return element; },
  };
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.setTimeout = callback => { callback(); return 1; };
  globalThis.clearTimeout = () => {};

  try {
    await showToast("test notice", "info", 0);
    const container = body.children[0];
    assert.equal(container.attributes.role, "status");
    assert.equal(container.attributes["aria-live"], "polite");
    assert.equal(container.attributes["aria-atomic"], "true");
    assert.equal(container.children.length, 0);
    assert.equal(nodes.some(node => node.className === "toast toast-info" && node.removed), true);
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalAnimationFrame;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});


test("escapeHtml escapes HTML metacharacters while preserving ordinary URL slashes", () => {
  assert.equal(
    escapeHtml('<script>alert("xss")</script>&"\'/path'),
    "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&quot;&#039;/path",
  );
});

test("escapeHtml handles null and undefined", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});
