import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_HISTORY_SAMPLES,
  clearMetricHistory,
  getMetricHistory,
  recordMetricSample,
} from "../src/metrics-history.js";

const payload = (hashrate, miners = 3, workers = 2) => ({
  hashrate: { total: [hashrate] },
  miners: { now: miners },
  workers,
});

beforeEach(() => clearMetricHistory());

test("records only numeric metric samples and excludes unrelated payload fields", () => {
  const sample = recordMetricSample({
    ...payload(12.5),
    apiUrl: "https://secret.example",
    apiToken: "never-store-this-token",
  }, 1000, "profile-a");

  assert.deepEqual(sample, [{ timestamp: 1000, hashrate: 12.5, miners: 3, workers: 2 }]);
  assert.equal(JSON.stringify(sample).includes("secret.example"), false);
  assert.equal(JSON.stringify(sample).includes("never-store-this-token"), false);
});

test("ignores invalid values and timestamps without inventing a zero hashrate", () => {
  assert.deepEqual(recordMetricSample(payload(-1), 1000), []);
  assert.deepEqual(recordMetricSample(payload(Number.NaN), 1001), []);
  assert.deepEqual(recordMetricSample(payload(Number.POSITIVE_INFINITY), 1002), []);
  assert.deepEqual(recordMetricSample(payload(10), Number.NaN), []);
  assert.deepEqual(getMetricHistory(), []);
});

test("keeps timestamps ordered and replaces a sample with the same timestamp", () => {
  recordMetricSample(payload(10), 1000, "profile-a");
  recordMetricSample(payload(11), 1001, "profile-a");
  assert.deepEqual(recordMetricSample(payload(9), 999, "profile-a").map(x => x.timestamp), [1000, 1001]);
  const replaced = recordMetricSample(payload(12), 1001, "profile-a");
  assert.deepEqual(replaced, [
    { timestamp: 1000, hashrate: 10, miners: 3, workers: 2 },
    { timestamp: 1001, hashrate: 12, miners: 3, workers: 2 },
  ]);
});

test("caps memory at the maximum history size and evicts oldest samples", () => {
  for (let index = 0; index < MAX_HISTORY_SAMPLES + 5; index += 1) {
    recordMetricSample(payload(index), index + 1, "profile-a");
  }
  const history = getMetricHistory();
  assert.equal(history.length, MAX_HISTORY_SAMPLES);
  assert.equal(history[0].timestamp, 6);
  assert.equal(history.at(-1).timestamp, MAX_HISTORY_SAMPLES + 5);
});

test("clears history when the active profile scope changes", () => {
  recordMetricSample(payload(10), 1000, "profile-a");
  const next = recordMetricSample(payload(20), 500, "profile-b");
  assert.deepEqual(next, [{ timestamp: 500, hashrate: 20, miners: 3, workers: 2 }]);
});

test("returns defensive copies so renderers cannot mutate stored samples", () => {
  recordMetricSample(payload(10), 1000);
  const result = getMetricHistory();
  result[0].hashrate = 999;
  assert.equal(getMetricHistory()[0].hashrate, 10);
});
