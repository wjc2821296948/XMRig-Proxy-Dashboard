import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatBytes,
  formatHashrate,
  formatNumber,
  formatUptime,
  getStatusInfo,
} from "../src/ui.js";

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
});
