import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { probeWriteAccess, request } from "../src/api.js";
import { saveConfig } from "../src/storage.js";

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

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const originalFetch = globalThis.fetch;
const originalDebug = console.debug;
const originalError = console.error;

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  saveConfig({
    apiUrl: "https://proxy.example:8080/",
    apiToken: "super-secret-token",
    remember: true,
    refreshInterval: 10,
  });
  console.debug = () => {};
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.debug = originalDebug;
  console.error = originalError;
});

test("request fails fast when no connection config exists", async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();

  await assert.rejects(request("/1/summary"), {
    message: "API configuration missing",
  });
});

test("request builds the URL, injects auth, and exposes an abort signal", async () => {
  let received;

  globalThis.fetch = async (url, options) => {
    received = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return { miners: { now: 3 } };
      },
    };
  };

  const result = await request("/1/summary", {
    headers: { "X-Test": "enabled" },
  });

  assert.deepEqual(result, { miners: { now: 3 } });
  assert.equal(received.url, "https://proxy.example:8080/1/summary");
  assert.equal(received.options.method, "GET");
  assert.equal(received.options.headers.get("Authorization"), "Bearer super-secret-token");
  assert.equal(received.options.headers.get("X-Test"), "enabled");
  assert.ok(received.options.signal instanceof AbortSignal);
  assert.equal(received.options.signal.aborted, false);
});

test("request masks the token in debug output", async () => {
  const debugMessages = [];
  console.debug = message => debugMessages.push(message);

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {};
    },
  });

  await request("/1/summary");

  assert.equal(debugMessages.length, 1);
  assert.match(debugMessages[0], /Bearer \*{10}/);
  assert.doesNotMatch(debugMessages[0], /super-secret-token/);
});

test("non-success HTTP responses retain their status code", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
  });

  await assert.rejects(request("/1/summary"), err => {
    assert.equal(err.message, "HTTP 401");
    assert.equal(err.status, 401);
    return true;
  });
});

test("write-access probe maps restricted responses separately from unknown failures", async () => {
  for (const status of [401, 403, 404]) {
    globalThis.fetch = async () => ({ ok: false, status });
    assert.equal(await probeWriteAccess(), "restricted");
  }

  globalThis.fetch = async () => ({ ok: false, status: 503 });
  assert.equal(await probeWriteAccess(), "unknown");

  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  assert.equal(await probeWriteAccess(), "unknown");
});

test("successful write-access probe reports unrestricted", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://proxy.example:8080/1/config");
    assert.equal(options.method, "GET");
    return {
      ok: true,
      status: 200,
      async json() {
        return { pools: [] };
      },
    };
  };

  assert.equal(await probeWriteAccess(), "unrestricted");
});
