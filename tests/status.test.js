import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createStatusTracker,
  getStatusInfo,
} from "../src/status.js";

const sample = ({
  now,
  max,
  uptime,
  accepted = 0,
  rejected = 0,
}) => ({
  uptime,
  miners: { now, max },
  results: { accepted, rejected },
});

test("cold start is waiting instead of online", () => {
  const tracker = createStatusTracker();
  assert.deepEqual(
    getStatusInfo(sample({ now: 0, max: 0, uptime: 10 }), tracker, 0),
    { cls: "status-waiting", text: "等待中" },
  );
});

test("recent peak replaces the sticky lifetime max", () => {
  const tracker = createStatusTracker();
  assert.deepEqual(
    getStatusInfo(sample({ now: 100, max: 100, uptime: 100 }), tracker, 0),
    { cls: "status-online", text: "在线" },
  );
  assert.deepEqual(
    getStatusInfo(sample({ now: 20, max: 100, uptime: 200 }), tracker, 10_000),
    { cls: "status-warning", text: "预警" },
  );

  assert.deepEqual(
    getStatusInfo(sample({ now: 20, max: 100, uptime: 1_200 }), tracker, 16 * 60 * 1000),
    { cls: "status-online", text: "在线" },
  );
});

test("brief zero-miner blips do not immediately go offline", () => {
  const tracker = createStatusTracker();
  getStatusInfo(sample({ now: 10, max: 10, uptime: 100 }), tracker, 0);

  assert.deepEqual(
    getStatusInfo(sample({ now: 0, max: 10, uptime: 110 }), tracker, 10_000),
    { cls: "status-online", text: "在线" },
  );

  assert.deepEqual(
    getStatusInfo(sample({ now: 0, max: 10, uptime: 130 }), tracker, 30_001),
    { cls: "status-offline", text: "离线" },
  );
});

test("restart is detected from uptime reset", () => {
  const tracker = createStatusTracker();
  getStatusInfo(sample({ now: 10, max: 10, uptime: 100 }), tracker, 0);

  assert.deepEqual(
    getStatusInfo(sample({ now: 0, max: 10, uptime: 1 }), tracker, 10_000),
    { cls: "status-restarting", text: "重启中" },
  );

  assert.deepEqual(
    getStatusInfo(sample({ now: 0, max: 0, uptime: 31 }), tracker, 40_001),
    { cls: "status-offline", text: "离线" },
  );
});

test("restart is not shown when a long polling interval observes recovered miners", () => {
  const tracker = createStatusTracker();
  getStatusInfo(sample({ now: 10, max: 10, uptime: 100 }), tracker, 0);

  assert.notDeepEqual(
    getStatusInfo(sample({ now: 10, max: 10, uptime: 1 }), tracker, 120_000),
    { cls: "status-restarting", text: "重启中" },
  );
});

test("health uses accepted/rejected deltas from the results object", () => {
  const tracker = createStatusTracker();

  getStatusInfo(
    sample({ now: 10, max: 10, uptime: 100, accepted: 100, rejected: 0 }),
    tracker,
    0,
  );

  assert.deepEqual(
    getStatusInfo(
      sample({ now: 10, max: 10, uptime: 110, accepted: 100, rejected: 100 }),
      tracker,
      10_000,
    ),
    { cls: "status-warning", text: "预警" },
  );
});

test("health still works with a 120-second refresh interval", () => {
  const tracker = createStatusTracker();

  getStatusInfo(
    sample({ now: 10, max: 10, uptime: 100, accepted: 100, rejected: 0 }),
    tracker,
    0,
  );

  assert.deepEqual(
    getStatusInfo(
      sample({ now: 10, max: 10, uptime: 220, accepted: 100, rejected: 100 }),
      tracker,
      120_000,
    ),
    { cls: "status-warning", text: "预警" },
  );
});

test("small share counts do not create a health warning", () => {
  const tracker = createStatusTracker();

  getStatusInfo(
    sample({ now: 10, max: 10, uptime: 100, accepted: 1, rejected: 0 }),
    tracker,
    0,
  );

  assert.deepEqual(
    getStatusInfo(
      sample({ now: 10, max: 10, uptime: 110, accepted: 1, rejected: 1 }),
      tracker,
      10_000,
    ),
    { cls: "status-online", text: "在线" },
  );
});

test("recovery from offline requires two positive samples", () => {
  const tracker = createStatusTracker();

  getStatusInfo(sample({ now: 10, max: 10, uptime: 100 }), tracker, 0);
  getStatusInfo(sample({ now: 0, max: 10, uptime: 110 }), tracker, 10_000);

  assert.deepEqual(
    getStatusInfo(sample({ now: 0, max: 10, uptime: 140 }), tracker, 40_001),
    { cls: "status-offline", text: "离线" },
  );

  assert.deepEqual(
    getStatusInfo(sample({ now: 5, max: 10, uptime: 150 }), tracker, 50_000),
    { cls: "status-warning", text: "预警" },
  );

  assert.deepEqual(
    getStatusInfo(sample({ now: 5, max: 10, uptime: 160 }), tracker, 60_000),
    { cls: "status-online", text: "在线" },
  );
});
