import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshotFilename, createDashboardSnapshot, registerSnapshotExport } from "../src/snapshot-export.js";

const fixedDate = new Date("2026-10-24T08:00:00.000Z");

test("dashboard snapshot includes useful metrics but excludes saved connection secrets", () => {
  const snapshot = createDashboardSnapshot({
    apiUrl: "https://private-proxy.example:8080",
    apiToken: "do-not-export-this-token",
    worker_id: "worker-1",
    version: "6.24.0",
    hashrate: { total: [10, 20, NaN, -1, 40, 50, 60] },
    miners: { now: 3, max: 5 },
    workers: 4,
    uptime: 90061,
    resources: {
      memory: { total: 1024, free: 256, resident_set_memory: 512 },
      load_average: [0.2, 0.3, Infinity, 0.5],
      hardware_concurrency: 8,
    },
    upstreams: { active: 2, sleep: 0, error: 1, total: 3, ratio: 1.5 },
    results: { accepted: 100, rejected: 2, invalid: 1, expired: 0, hashes_total: 1024, latency: 12, avg_time: 0.4 },
  }, fixedDate);

  assert.equal(snapshot.format, "xmrig-proxy-dashboard-metrics");
  assert.equal(snapshot.exportedAt, fixedDate.toISOString());
  assert.deepEqual(snapshot.metrics.hashrate.values, [10, 20, null, null, 40, 50]);
  assert.equal(snapshot.metrics.miners.current, 3);
  assert.equal(snapshot.metrics.shares.accepted, 100);
  assert.equal(snapshot.metrics.resources.loadAverage.length, 3);
  const json = JSON.stringify(snapshot);
  assert.doesNotMatch(json, /private-proxy\.example|do-not-export-this-token|apiToken/);
});

test("snapshot export handles a missing header container without throwing", () => {
  const messages = [];
  const cleanup = registerSnapshotExport({
    documentRef: { createElement: () => { throw new Error("should not create an element"); } },
    container: null,
    getData: () => null,
    notify: (message, type) => messages.push({ message, type }),
  });
  assert.equal(typeof cleanup, "function");
  assert.equal(messages[0].type, "warning");
  cleanup();
});

test("snapshot filename is timestamped and filesystem-friendly", () => {
  assert.equal(
    buildSnapshotFilename(fixedDate),
    "xmrig-proxy-dashboard-snapshot-2026-10-24T08-00-00-000Z.json",
  );
});

class FakeElement extends EventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName;
    this.attributes = {};
    this.children = [];
    this.removed = false;
    this.disabled = false;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  appendChild(child) { this.children.push(child); child.parentNode = this; }
  remove() {
    this.removed = true;
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this);
  }
  click() { this.dispatchEvent(new Event("click")); }
}

test("snapshot export downloads locally and reports when no data is available", async () => {
  const created = [];
  const body = new FakeElement("body");
  const container = new FakeElement("div");
  const messages = [];
  const urls = [];
  const scheduled = [];
  const documentRef = {
    body,
    createElement(tagName) {
      const node = new FakeElement(tagName);
      created.push(node);
      return node;
    },
  };
  const urlApi = {
    createObjectURL(blob) { urls.push({ blob }); return "blob:snapshot-test"; },
    revokeObjectURL(url) { urls.push({ revoked: url }); },
  };
  let data = null;
  const cleanup = registerSnapshotExport({
    documentRef,
    container,
    getData: () => data,
    notify: (message, type) => messages.push({ message, type }),
    now: () => fixedDate,
    urlApi,
    setTimeoutRef: callback => { scheduled.push(callback); return 1; },
  });
  const button = container.children[0];
  button.click();
  assert.equal(messages[0].type, "warning");
  assert.equal(urls.length, 0);

  data = { worker_id: "worker", hashrate: { total: [1, 2, 3, 4, 5, 6] } };
  button.click();
  await new Promise(resolve => setImmediate(resolve));
  const link = created.find(node => node.tagName === "a");
  assert.ok(link);
  assert.equal(link.download, "xmrig-proxy-dashboard-snapshot-2026-10-24T08-00-00-000Z.json");
  assert.equal(urls[0].blob.type, "application/json;charset=utf-8");
  assert.equal(link.removed, true);
  assert.equal(messages.at(-1).type, "success");
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(urls[1].revoked, "blob:snapshot-test");

  cleanup();
  assert.equal(button.removed, true);
});
