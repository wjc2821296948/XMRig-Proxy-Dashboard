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

test("request refuses URLs outside the configured proxy origin before sending credentials", async () => {
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, status: 200, async json() { return {}; } };
  };

  await assert.rejects(
    request("https://attacker.example/collect"),
    { message: "API request URL must stay on the configured proxy origin" },
  );
  await assert.rejects(
    request("//attacker.example/collect"),
    { message: "API request URL must stay on the configured proxy origin" },
  );
  assert.equal(fetchCalled, false);
});

test("request client rejects write methods and request bodies", async () => {
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, status: 200, async json() { return {}; } };
  };

  await assert.rejects(
    request("/1/config", { method: "PUT", body: JSON.stringify({ pools: [] }) }),
    { message: "Dashboard API client is read-only" },
  );
  await assert.rejects(
    request("/1/config", { body: JSON.stringify({ pools: [] }) }),
    { message: "Dashboard API client is read-only" },
  );
  assert.equal(fetchCalled, false);
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


test("request omits Authorization when no API token is configured", async () => {
  saveConfig({
    apiUrl: "https://proxy.example:8080/",
    apiToken: "",
    remember: true,
    refreshInterval: 10,
  });

  let received;
  globalThis.fetch = async (url, options) => {
    received = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return { miners: { now: 1 } };
      },
    };
  };

  const result = await request("/1/summary");

  assert.deepEqual(result, { miners: { now: 1 } });
  assert.equal(received.url, "https://proxy.example:8080/1/summary");
  assert.equal(received.options.headers.get("Authorization"), null);
});

test("request preserves an explicitly supplied custom auth scheme without a configured API token", async () => {
  saveConfig({
    apiUrl: "https://proxy.example:8080/",
    apiToken: "",
    remember: true,
    refreshInterval: 10,
  });

  const debugMessages = [];
  console.debug = message => debugMessages.push(message);
  let received;
  globalThis.fetch = async (url, options) => {
    received = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return {};
      },
    };
  };

  await request("/1/summary", {
    headers: { Authorization: "Basic example-credential" },
  });

  assert.equal(received.options.headers.get("Authorization"), "Basic example-credential");
  assert.equal(debugMessages.length, 1);
  assert.match(debugMessages[0], /custom \(redacted\)/);
  assert.doesNotMatch(debugMessages[0], /example-credential/);
});

test("timeout DOMExceptions are normalized without mutating read-only message", async () => {
  globalThis.fetch = async () => {
    throw new DOMException("The operation timed out", "TimeoutError");
  };

  await assert.rejects(request("/1/summary"), err => {
    assert.equal(err.name, "TimeoutError");
    assert.equal(err.message, "Request timed out");
    assert.ok(err.cause instanceof DOMException);
    return true;
  });
});


test("request respects a caller-provided AbortSignal as well as its timeout", async () => {
  const controller = new AbortController();
  let receivedSignal;
  globalThis.fetch = async (_url, options) => {
    receivedSignal = options.signal;
    return new Promise((resolve, reject) => {
      receivedSignal.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted", "AbortError"));
      }, { once: true });
    });
  };

  const pending = request("/1/summary", { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(receivedSignal instanceof AbortSignal);
  assert.notEqual(receivedSignal, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("fallback request signal listeners are removed when the request completes", async () => {
  const originalAny = AbortSignal.any;
  Object.defineProperty(AbortSignal, "any", { configurable: true, writable: true, value: undefined });
  const controller = new AbortController();
  const originalAdd = controller.signal.addEventListener.bind(controller.signal);
  const originalRemove = controller.signal.removeEventListener.bind(controller.signal);
  const listeners = new Set();
  controller.signal.addEventListener = (type, listener, options) => {
    if (type === "abort") listeners.add(listener);
    return originalAdd(type, listener, options);
  };
  controller.signal.removeEventListener = (type, listener, options) => {
    if (type === "abort") listeners.delete(listener);
    return originalRemove(type, listener, options);
  };
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, status: 200, async json() { return {}; } };
  };

  try {
    await request("/1/summary", { signal: controller.signal });
    assert.equal(listeners.size, 0);
  } finally {
    Object.defineProperty(AbortSignal, "any", { configurable: true, writable: true, value: originalAny });
  }
});


test("fallback request signal propagates timeout aborts and cleans up listeners", async () => {
  const originalAny = Object.getOwnPropertyDescriptor(AbortSignal, "any");
  const originalTimeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  const timeoutController = new AbortController();
  const callerController = new AbortController();
  Object.defineProperty(AbortSignal, "any", { configurable: true, writable: true, value: undefined });
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    writable: true,
    value: () => timeoutController.signal,
  });
  const originalAdd = callerController.signal.addEventListener.bind(callerController.signal);
  const originalRemove = callerController.signal.removeEventListener.bind(callerController.signal);
  const listeners = new Set();
  callerController.signal.addEventListener = (type, listener, options) => {
    if (type === "abort") listeners.add(listener);
    return originalAdd(type, listener, options);
  };
  callerController.signal.removeEventListener = (type, listener, options) => {
    if (type === "abort") listeners.delete(listener);
    return originalRemove(type, listener, options);
  };
  globalThis.fetch = async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });

  try {
    const pending = request("/1/summary", { signal: callerController.signal });
    await new Promise(resolve => setImmediate(resolve));
    timeoutController.abort(new DOMException("The operation timed out", "TimeoutError"));
    await assert.rejects(pending, err => {
      assert.equal(err.name, "TimeoutError");
      assert.equal(err.message, "Request timed out");
      assert.ok(err.cause instanceof DOMException);
      return true;
    });
    assert.equal(listeners.size, 0);
  } finally {
    if (originalAny) Object.defineProperty(AbortSignal, "any", originalAny);
    else delete AbortSignal.any;
    if (originalTimeout) Object.defineProperty(AbortSignal, "timeout", originalTimeout);
    else delete AbortSignal.timeout;
  }
});

test("request handles network errors (CORS, DNS, connection refused) gracefully", async () => {
  // Simulate network error (TypeError from fetch on CORS/DNS/connection issues)
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  await assert.rejects(request("/1/summary"), err => {
    assert.ok(err instanceof TypeError || err.name === "TypeError");
    return true;
  });
});

test("request handles AbortError from fetch (e.g., CORS preflight failure)", async () => {
  globalThis.fetch = async () => {
    throw new DOMException("The operation was aborted", "AbortError");
  };

  await assert.rejects(request("/1/summary"), err => {
    assert.equal(err.name, "AbortError");
    return true;
  });
});

test("probeWriteAccess returns 'unknown' for network/CORS errors", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  assert.equal(await probeWriteAccess(), "unknown");
});

test("probeWriteAccess returns 'unknown' for DNS resolution failures", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("DNS lookup failed");
  };

  assert.equal(await probeWriteAccess(), "unknown");
});
