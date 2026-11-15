import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  loadOfflineSnapshot,
  sanitizeOfflineSummary,
  saveOfflineSnapshot,
} from "../src/offline-snapshot.js";

class MemoryStorage {
  #data = new Map();

  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }

  setItem(key, value) {
    this.#data.set(String(key), String(value));
  }

  removeItem(key) {
    this.#data.delete(key);
  }
}

const originalStorage = globalThis.localStorage;
const snapshot = {
  worker_id: "worker-01",
  version: "6.24.0",
  apiUrl: "https://proxy.example:8080",
  apiToken: "do-not-cache-this-token",
  hashrate: { total: [12.5, 11, 10, 9, 8, 7, 999] },
  miners: { now: 4, max: 8 },
  workers: 6,
  uptime: 3600,
  resources: {
    memory: { total: 1024, free: 256, resident_set_memory: 500 },
    load_average: [0.1, 0.2, 0.3, 0.4],
    hardware_concurrency: 8,
  },
  upstreams: { active: 2, sleep: 1, error: 0, total: 3, ratio: 2 },
  results: {
    accepted: 120,
    rejected: 2,
    invalid: 1,
    expired: 0,
    latency: 30,
    hashes_total: 5000,
    avg_time: 1.5,
  },
  untrusted: { token: "must-not-be-stored" },
};

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

afterEach(() => {
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
});

test("offline summary cache stores only allowlisted dashboard metrics", () => {
  const savedAt = 1_800_000_000_000;
  assert.equal(saveOfflineSnapshot("profile-a", snapshot, savedAt), true);

  const raw = globalThis.localStorage.getItem("dashboard_offline_snapshot_v1");
  assert.ok(raw);
  assert.doesNotMatch(raw, /proxy\.example|do-not-cache-this-token|must-not-be-stored|apiUrl|apiToken/);

  const loaded = loadOfflineSnapshot("profile-a", savedAt + 1000);
  assert.equal(loaded.savedAt, savedAt);
  assert.deepEqual(loaded.data.hashrate.total, [12.5, 11, 10, 9, 8, 7]);
  assert.deepEqual(loaded.data.miners, { now: 4, max: 8 });
  assert.deepEqual(loaded.data.resources.load_average, [0.1, 0.2, 0.3]);
  assert.deepEqual(loaded.data.results.accepted, 120);
  assert.equal("untrusted" in loaded.data, false);
});

test("offline summary cache is scoped to the currently selected Proxy profile", () => {
  assert.equal(saveOfflineSnapshot("profile-a", snapshot, 1000), true);
  assert.equal(loadOfflineSnapshot("profile-b", 2000), null);
  assert.ok(loadOfflineSnapshot("profile-a", 2000));
});

test("offline summary cache expires after seven days and rejects future timestamps", () => {
  const savedAt = 1_800_000_000_000;
  assert.equal(saveOfflineSnapshot("profile-a", snapshot, savedAt), true);
  assert.equal(loadOfflineSnapshot("profile-a", savedAt + 7 * 24 * 60 * 60 * 1000), null);
  assert.equal(loadOfflineSnapshot("profile-a", savedAt - 5 * 60 * 1000 - 1), null);
});

test("offline summary cache rejects invalid payloads and invalid profile identifiers", () => {
  assert.equal(saveOfflineSnapshot("profile-a", null, 1000), false);
  assert.equal(saveOfflineSnapshot("", snapshot, 1000), false);
  assert.equal(saveOfflineSnapshot("x".repeat(257), snapshot, 1000), false);
  assert.equal(sanitizeOfflineSummary({ miners: [] }), null);
  assert.equal(loadOfflineSnapshot("", 1000), null);
});
