import { test } from "node:test";
import assert from "node:assert/strict";

import { buildUPlotData } from "../src/advanced-history-chart.js";

test("uPlot data uses ascending Unix-second timestamps and aligned hashrate values", () => {
  const data = buildUPlotData([
    { timestamp: 3000, hashrate: 30 },
    { timestamp: 1000, hashrate: 10 },
    { timestamp: 2000, hashrate: 20 },
  ]);

  assert.deepEqual(data, [
    [1, 2, 3],
    [10, 20, 30],
  ]);
});

test("uPlot data ignores invalid samples and keeps the latest duplicate timestamp", () => {
  const data = buildUPlotData([
    { timestamp: 2000, hashrate: 2 },
    { timestamp: 1000, hashrate: 1 },
    { timestamp: 2000, hashrate: 22 },
    { timestamp: -1, hashrate: 9 },
    { timestamp: 3000, hashrate: Number.NaN },
    { timestamp: Infinity, hashrate: 8 },
    null,
  ]);

  assert.deepEqual(data, [
    [1, 2],
    [1, 22],
  ]);
});

test("uPlot data returns empty aligned arrays for missing or malformed input", () => {
  assert.deepEqual(buildUPlotData(null), [[], []]);
  assert.deepEqual(buildUPlotData([]), [[], []]);
  assert.deepEqual(buildUPlotData([{ timestamp: "1000", hashrate: 3 }]), [[], []]);
});
