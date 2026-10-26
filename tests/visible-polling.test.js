import { test } from "node:test";
import assert from "node:assert/strict";
import { registerVisiblePolling } from "../src/visible-polling.js";

class TestDocument extends EventTarget {
  visibilityState = "visible";
}

function createFakeTimers() {
  let nextId = 0;
  const jobs = new Map();
  return {
    jobs,
    setTimeout(callback, delay) {
      const id = ++nextId;
      jobs.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      jobs.delete(id);
    },
    async fireNext() {
      const first = jobs.entries().next().value;
      assert.ok(first, "expected a scheduled timeout");
      const [id, job] = first;
      jobs.delete(id);
      await job.callback();
    },
  };
}

test("visible polling is paused while hidden and resumes when visible", () => {
  const documentRef = new TestDocument();
  documentRef.visibilityState = "hidden";
  const timers = createFakeTimers();
  let refreshes = 0;
  const cleanup = registerVisiblePolling({
    documentRef,
    intervalMs: 5000,
    refresh: () => { refreshes += 1; },
    setTimeoutRef: timers.setTimeout,
    clearTimeoutRef: timers.clearTimeout,
  });

  assert.equal(timers.jobs.size, 0);
  documentRef.visibilityState = "visible";
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(timers.jobs.size, 1);
  documentRef.visibilityState = "hidden";
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(timers.jobs.size, 0);
  assert.equal(refreshes, 0);

  documentRef.visibilityState = "visible";
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(timers.jobs.size, 1);
  cleanup();
  assert.equal(timers.jobs.size, 0);
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(timers.jobs.size, 0);
});

test("visible polling schedules the next refresh only after the previous one settles", async () => {
  const documentRef = new TestDocument();
  const timers = createFakeTimers();
  let release;
  let refreshes = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const cleanup = registerVisiblePolling({
    documentRef,
    intervalMs: 5000,
    refresh: async () => { refreshes += 1; await pending; },
    setTimeoutRef: timers.setTimeout,
    clearTimeoutRef: timers.clearTimeout,
  });

  const firing = timers.fireNext();
  await Promise.resolve();
  assert.equal(refreshes, 1);
  assert.equal(timers.jobs.size, 0);
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(timers.jobs.size, 0);

  release();
  await firing;
  assert.equal(timers.jobs.size, 1);
  cleanup();
  assert.equal(timers.jobs.size, 0);
});

test("visible polling clamps invalidly short intervals to one second", () => {
  const documentRef = new TestDocument();
  const timers = createFakeTimers();
  const cleanup = registerVisiblePolling({
    documentRef,
    intervalMs: 10,
    refresh() {},
    setTimeoutRef: timers.setTimeout,
    clearTimeoutRef: timers.clearTimeout,
  });
  assert.equal([...timers.jobs.values()][0].delay, 1000);
  cleanup();
});


test("visible polling stops rescheduling while shouldRun is false", async () => {
  const documentRef = new TestDocument();
  const timers = createFakeTimers();
  let canRun = true;
  const cleanup = registerVisiblePolling({
    documentRef,
    intervalMs: 5000,
    shouldRun: () => canRun,
    refresh() {},
    setTimeoutRef: timers.setTimeout,
    clearTimeoutRef: timers.clearTimeout,
  });

  canRun = false;
  await timers.fireNext();
  assert.equal(timers.jobs.size, 0, "inactive polling should leave no timer pending");

  canRun = true;
  documentRef.visibilityState = "hidden";
  documentRef.dispatchEvent(new Event("visibilitychange"));
  documentRef.visibilityState = "visible";
  documentRef.dispatchEvent(new Event("visibilitychange"));
  assert.equal(timers.jobs.size, 1, "a visible-state change can restart eligible polling");
  cleanup();
});

test("unexpected refresh rejections are reported and polling remains scheduled", async () => {
  const documentRef = new TestDocument();
  const timers = createFakeTimers();
  const errors = [];
  const cleanup = registerVisiblePolling({
    documentRef,
    intervalMs: 5000,
    refresh: async () => { throw new Error("unexpected failure"); },
    onError: error => errors.push(error.message),
    setTimeoutRef: timers.setTimeout,
    clearTimeoutRef: timers.clearTimeout,
  });

  await timers.fireNext();
  assert.deepEqual(errors, ["unexpected failure"]);
  assert.equal(timers.jobs.size, 1);
  cleanup();
});
