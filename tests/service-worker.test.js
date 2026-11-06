import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerSource = readFileSync(join(root, "sw.js"), "utf8");

function loadWorker({ fetchImpl }) {
  const handlers = Object.create(null);
  const scope = "https://dashboard.example/app/";
  const self = {
    location: new URL(scope),
    registration: { scope },
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
  };
  const caches = {
    match: async () => {
      throw new Error("CacheStorage unavailable");
    },
    open: async () => ({ put: async () => {} }),
    keys: async () => [],
    delete: async () => true,
  };

  runInNewContext(workerSource, {
    self,
    caches,
    fetch: fetchImpl,
    URL,
    Response,
  });
  return handlers;
}

function dispatchFetch(handler, request) {
  let responsePromise;
  handler({
    request,
    respondWith(value) {
      responsePromise = Promise.resolve(value);
    },
  });
  assert.ok(responsePromise, "service worker should intercept the request");
  return responsePromise;
}

test("a rejected CacheStorage read falls through to the network for static assets", async () => {
  let fetchCount = 0;
  const handlers = loadWorker({
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response("network asset", { status: 200 });
    },
  });
  const response = await dispatchFetch(handlers.fetch, {
    method: "GET",
    mode: "same-origin",
    url: "https://dashboard.example/app/styles.css",
    headers: { has: () => false },
  });

  assert.equal(fetchCount, 1);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "network asset");
});

test("a rejected navigation cache fallback returns an error response instead of rejecting", async () => {
  const handlers = loadWorker({
    fetchImpl: async () => {
      throw new Error("network unavailable");
    },
  });
  const response = await dispatchFetch(handlers.fetch, {
    method: "GET",
    mode: "navigate",
    url: "https://dashboard.example/app/",
    headers: { has: () => false },
  });

  assert.equal(response.type, "error");
});
