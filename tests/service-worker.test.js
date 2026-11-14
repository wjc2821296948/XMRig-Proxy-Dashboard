import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerSource = readFileSync(join(root, "service-worker.js"), "utf8");
const SCOPE = "https://dashboard.example.test/app/";
const CACHE_PREFIX = "xmrig-proxy-dashboard-shell-";
const RESPONSE_ERROR = { type: "error", body: null };

function makeResponse(body, { ok = true, type = "basic" } = {}) {
  return {
    body,
    ok,
    type,
    clone() {
      return makeResponse(body, { ok, type });
    },
  };
}

function createHarness(options = {}) {
  const listeners = new Map();
  const entries = new Map();
  const calls = {
    open: [],
    addAll: [],
    match: [],
    put: [],
    fetch: [],
    deleted: [],
  };
  const cache = {
    async addAll(paths) {
      calls.addAll.push(...paths);
      if (options.addAllError) throw options.addAllError;
      for (const path of paths) {
        const absoluteUrl = new URL(path, SCOPE);
        const relativePath = decodeURIComponent(absoluteUrl.pathname.slice(new URL(SCOPE).pathname.length));
        assert.ok(
          existsSync(join(root, relativePath)),
          `APP_SHELL asset does not exist: ${path}`,
        );
        entries.set(absoluteUrl.href, makeResponse(`cached:${path}`));
      }
    },
    async match(request) {
      calls.match.push(request);
      if (options.matchError) throw options.matchError;
      const key = typeof request === "string" ? new URL(request, SCOPE).href : request.url;
      return entries.get(key) ?? null;
    },
    async put(request, response) {
      calls.put.push(request);
      if (options.putError) throw options.putError;
      const key = typeof request === "string" ? new URL(request, SCOPE).href : request.url;
      entries.set(key, response);
    },
  };
  const cacheKeys = options.cacheKeys ?? [
    `${CACHE_PREFIX}v1`,
    `${CACHE_PREFIX}v2`,
    "unrelated-cache",
  ];
  const caches = {
    async open(name) {
      calls.open.push(name);
      if (options.openError) throw options.openError;
      return cache;
    },
    async keys() {
      return cacheKeys;
    },
    async delete(name) {
      calls.deleted.push(name);
      return true;
    },
  };
  const flags = { skipWaiting: false, claimed: false };
  const self = {
    registration: { scope: SCOPE },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async skipWaiting() {
      flags.skipWaiting = true;
    },
    clients: {
      async claim() {
        flags.claimed = true;
      },
    },
  };
  const fetchImpl = options.fetch ?? (async request => {
    calls.fetch.push(request);
    return makeResponse(`network:${request.url}`);
  });
  const context = {
    self,
    caches,
    URL,
    Response: { error: () => RESPONSE_ERROR },
    fetch: async request => {
      calls.fetch.push(request);
      if (options.fetchError) throw options.fetchError;
      if (options.fetch) return options.fetch(request);
      return fetchImpl(request);
    },
  };

  vm.runInNewContext(workerSource, context, { filename: "service-worker.js" });

  async function runLifecycle(type) {
    let pending;
    const listener = listeners.get(type);
    assert.equal(typeof listener, "function", `missing ${type} listener`);
    listener({ waitUntil(promise) { pending = promise; } });
    assert.ok(pending, `${type} must register waitUntil()`);
    await pending;
  }

  async function runFetch(request) {
    let responsePromise;
    const listener = listeners.get("fetch");
    listener({
      request,
      respondWith(promise) {
        responsePromise = Promise.resolve(promise);
      },
    });
    return {
      intercepted: responsePromise !== undefined,
      response: responsePromise ? await responsePromise : undefined,
    };
  }

  return { listeners, entries, calls, flags, runLifecycle, runFetch };
}

test("install precaches every existing app-shell asset, including i18n and network status", async () => {
  const harness = createHarness();
  await harness.runLifecycle("install");

  assert.ok(harness.calls.addAll.includes("./src/i18n.js"));
  assert.ok(harness.calls.addAll.includes("./src/network-status.js"));
  assert.ok(harness.calls.addAll.includes("./src/offline-snapshot.js"));
  assert.ok(harness.calls.addAll.includes("./index.html"));
  assert.equal(harness.flags.skipWaiting, true);
  assert.ok(harness.calls.open.every(name => name === `${CACHE_PREFIX}v2`));
});

test("installation fails rather than activating a partial app shell", async () => {
  const harness = createHarness({ addAllError: new Error("missing app-shell asset") });
  await assert.rejects(harness.runLifecycle("install"), /missing app-shell asset/);
  assert.equal(harness.flags.skipWaiting, false);
});

test("offline navigation falls back to the cached index document", async () => {
  const harness = createHarness({
    fetchError: new Error("offline"),
  });
  const cachedIndex = makeResponse("cached-index");
  harness.entries.set(new URL("./index.html", SCOPE).href, cachedIndex);

  const result = await harness.runFetch({
    method: "GET",
    mode: "navigate",
    url: new URL("./", SCOPE).href,
  });

  assert.equal(result.intercepted, true);
  assert.equal(result.response, cachedIndex);
});

test("an app-shell cache miss fetches from the network and stores a successful response", async () => {
  const networkResponse = makeResponse("fresh-main");
  const harness = createHarness({ fetch: async () => networkResponse });
  const request = {
    method: "GET",
    mode: "cors",
    url: new URL("./src/main.js", SCOPE).href,
  };

  const result = await harness.runFetch(request);
  assert.equal(result.intercepted, true);
  assert.equal(result.response, networkResponse);
  assert.equal(harness.calls.fetch.length, 1);
  assert.equal(harness.calls.put.length, 1);
  assert.ok(harness.entries.has(request.url));
});

test("CacheStorage read failures behave like misses and do not block network access", async () => {
  const networkResponse = makeResponse("network-after-cache-read-error");
  const harness = createHarness({
    matchError: new Error("CacheStorage read denied"),
    fetch: async () => networkResponse,
  });
  const result = await harness.runFetch({
    method: "GET",
    mode: "cors",
    url: new URL("./src/main.js", SCOPE).href,
  });

  assert.equal(result.response, networkResponse);
  assert.equal(harness.calls.fetch.length, 1);
});

test("CacheStorage write failures do not discard successful network responses", async () => {
  const networkResponse = makeResponse("network-survives-cache-write-error");
  const harness = createHarness({
    putError: new Error("CacheStorage write denied"),
    fetch: async () => networkResponse,
  });
  const result = await harness.runFetch({
    method: "GET",
    mode: "cors",
    url: new URL("./src/main.js", SCOPE).href,
  });

  assert.equal(result.response, networkResponse);
  assert.equal(harness.calls.fetch.length, 1);
  assert.equal(harness.calls.put.length, 1);
});

test("Proxy API and non-allowlisted same-origin resources bypass the Service Worker cache", async () => {
  const harness = createHarness();
  const requests = [
    {
      method: "GET",
      mode: "cors",
      url: new URL("./1/summary", SCOPE).href,
    },
    {
      method: "GET",
      mode: "cors",
      url: new URL("./not-in-app-shell.js", SCOPE).href,
    },
    {
      method: "POST",
      mode: "cors",
      url: new URL("./src/main.js", SCOPE).href,
    },
  ];

  for (const request of requests) {
    const result = await harness.runFetch(request);
    assert.equal(result.intercepted, false);
  }
  assert.equal(harness.calls.fetch.length, 0);
  assert.equal(harness.calls.match.length, 0);
  assert.equal(harness.calls.put.length, 0);
});

test("activation deletes only obsolete dashboard shell caches and claims clients", async () => {
  const harness = createHarness();
  await harness.runLifecycle("activate");

  assert.deepEqual(harness.calls.deleted, [`${CACHE_PREFIX}v1`]);
  assert.equal(harness.flags.claimed, true);
});
