/**
 * api.js – Centralised XMRig-Proxy API client
 *
 * Provides a single `request` function that automatically prefixes the base URL,
 * injects the `Authorization: Bearer <token>` header, applies a timeout and
 * normalises error handling.
 *
 * The token is never logged in plain text – any debug output replaces the token
 * value with `Bearer **********`.
 */

import { getConfig } from "./storage.js";

const REQUEST_TIMEOUT_MS = 8000;

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(timeoutMs), cleanup() {} };
  }

  // Older browsers may implement AbortController but not AbortSignal.timeout.
  // Keep requests bounded there too, and release the timer as soon as fetch settles.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("The operation timed out", "TimeoutError"));
  }, timeoutMs);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

function combineRequestSignals(timeoutSignal, callerSignal) {
  if (!callerSignal) return { signal: timeoutSignal, cleanup() {} };
  if (typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any([timeoutSignal, callerSignal]), cleanup() {} };
  }

  // Compatibility fallback: propagate either abort and remove listeners
  // when the request settles so caller signals do not retain completed work.
  const controller = new AbortController();
  const abortFrom = signal => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  const onCallerAbort = () => abortFrom(callerSignal);
  const onTimeout = () => abortFrom(timeoutSignal);
  const listen = (signal, handler) => {
    if (signal.aborted) {
      abortFrom(signal);
      return;
    }
    signal.addEventListener("abort", handler, { once: true });
    if (signal.aborted) abortFrom(signal);
  };
  listen(callerSignal, onCallerAbort);
  listen(timeoutSignal, onTimeout);
  return {
    signal: controller.signal,
    cleanup() {
      callerSignal.removeEventListener("abort", onCallerAbort);
      timeoutSignal.removeEventListener("abort", onTimeout);
    },
  };
}

/**
 * Central request wrapper.
 *
 * Intentionally read-only. XMRig-Proxy's `restricted: true` mode disables
 * every write endpoint (PUT /1/config, pool switching, hot reload), so this
 * dashboard deliberately exposes no write helpers — the operator configures
 * the proxy on the server. Adding a write method here would succeed at the
 * transport layer and fail at the server; do not add one. The header
 * carries a permanent "只读视图" ribbon so the operator always sees this
 * constraint without having to dig.
 *
 * @param {string} path   Path relative to the XMRig-Proxy API base (e.g. "/1/summary").
 * @param {object} [options] Optional fetch options (headers and signal).
 *   This client is read-only: only GET requests without a body are allowed.
 * @returns {Promise<any>} Resolves with parsed JSON on success.
 */
export async function request(path, options = {}) {
  const cfg = getConfig();
  if (!cfg || !cfg.apiUrl) {
    throw new Error("API configuration missing");
  }

  const baseUrl = new URL(cfg.apiUrl);
  const requestUrl = new URL(path, baseUrl);
  // Never attach a saved proxy token to a caller-supplied absolute URL or
  // protocol-relative path that escapes the configured proxy's origin.
  if (requestUrl.origin !== baseUrl.origin || requestUrl.username || requestUrl.password) {
    throw new Error("API request URL must stay on the configured proxy origin");
  }
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" || options.body != null) {
    throw new Error("Dashboard API client is read-only");
  }
  const url = requestUrl.toString();
  const headers = new Headers(options.headers || {});
  const apiToken = typeof cfg.apiToken === "string" ? cfg.apiToken : "";
  const hasToken = apiToken.length > 0;

  // A configured proxy token always takes precedence. Without one, do not
  // synthesize an Authorization header, but preserve an explicit caller
  // header so callers can use other schemes (for example Basic or a custom
  // token header value) when they intentionally pass it in request options.
  if (hasToken) {
    headers.set("Authorization", `Bearer ${apiToken}`);
  }

  // Never log credential contents, including caller-supplied auth schemes.
  const authorizationForLog = hasToken
    ? "Bearer **********"
    : headers.has("Authorization") ? "custom (redacted)" : "(none)";
  // URLs may contain API keys or other secrets in query parameters. Keep
  // diagnostics useful without ever recording query strings or fragments.
  let safeUrl = "(invalid URL)";
  try {
    const parsedUrl = new URL(url);
    safeUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    // Logging must never be the reason an API request fails. URL construction
    // above normally guarantees a valid URL, but persisted state can be stale
    // or corrupted, so keep diagnostics defensive.
  }
  console.debug(`API request → ${safeUrl} – Authorization: ${authorizationForLog}`);

  // 8-second timeout via the platform-native AbortSignal so the underlying
  // fetch is actually cancelled (Promise.race used to leave it draining).
  const timeout = createTimeoutSignal(REQUEST_TIMEOUT_MS);
  const requestSignals = combineRequestSignals(timeout.signal, options.signal);

  try {
    const response = await fetch(url, {
      ...options,
      method: options.method || "GET",
      headers,
      signal: requestSignals.signal,
    });
    if (!response.ok) {
      // 401 / 403 trigger a logout flow upstream.
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    try {
      return await response.json();
    } catch (error) {
      // Do not surface raw response bodies or parser details: upstream proxies,
      // captive portals, and reverse proxies may return sensitive HTML/text.
      if (error instanceof SyntaxError) {
        throw new Error("Invalid JSON response from Proxy API", { cause: error });
      }
      throw error;
    }
  } catch (e) {
    // AbortSignal.timeout() throws a DOMException whose `name` is "TimeoutError"
    // (distinct from "AbortError" raised by AbortController.abort()). Browsers
    // that pre-date `AbortSignal.timeout` still throw "AbortError"; in that
    // case the upstream message is already a generic "The operation was
    // aborted" so we keep it. The point of this branch was always to label
    // timeout cancellations consistently — only relabel that case.
    if (e?.name === "TimeoutError") {
      // DOMException.message is read-only in browsers. Mutating it can throw
      // a TypeError and hide the original timeout from the UI.
      const timeoutError = new Error("Request timed out", { cause: e });
      timeoutError.name = "TimeoutError";
      // Some consoles do not expand Error.cause by default; retain the
      // original timeout stack in the visible stack for browser diagnostics.
      if (e?.stack && timeoutError.stack) {
        timeoutError.stack += `\nCaused by original timeout:\n${e.stack}`;
      }
      e = timeoutError;
    }
    console.error(`API error (masked): ${e.message}`);
    throw e;
  } finally {
    requestSignals.cleanup();
    timeout.cleanup();
  }
}

/**
 * Result of probing the connected XMRig-Proxy for write access.
 *
 * - "unrestricted" — `GET /1/config` returned 2xx; the proxy allows writes.
 * - "restricted"   — the proxy answered with HTTP 401/403/404, which is how
 *                    XMRig-Proxy expresses `restricted: true`. The dashboard
 *                    should disable the config-mode row but otherwise stay
 *                    quiet (this is the expected, supported state).
 * - "unknown"      — anything else (network failure, timeout, 5xx, CORS).
 *                    We deliberately do NOT classify this as restricted: the
 *                    proxy might be perfectly willing to serve writes, we
 *                    just couldn't reach it cleanly. The caller should show
 *                    a toast so the operator doesn't blame the proxy for
 *                    what is actually a network or config problem.
 *
 * @typedef {"unrestricted" | "restricted" | "unknown"} WriteAccessState
 */

/**
 * Probe whether the connected XMRig-Proxy exposes the write endpoints.
 *
 * XMRig-Proxy's `restricted: true` mode blocks every `/1/config` request
 * (both GET and PUT) with HTTP 401/403/404. A successful GET against
 * `/1/config` therefore proves the operator's proxy runs with
 * `restricted: false` (or `--http-no-restricted`).
 *
 * The probe is read-only — it never sends a write request — so it is
 * safe to run on every successful connect. The dashboard uses its
 * result to decide whether to enable the "配置模式" entry in the
 * header mode picker.
 *
 * @returns {Promise<WriteAccessState>}
 */
export async function probeWriteAccess() {
  try {
    await request("/1/config");
    return "unrestricted";
  } catch (err) {
    // Restricted mode is the only XMRig-Proxy state we want to treat as
    // "definitely no writes". Everything else (network, timeout, 5xx,
    // CORS preflight failure) is an unknown — see WriteAccessState above.
    if (err && (err.status === 401 || err.status === 403 || err.status === 404)) {
      return "restricted";
    }
    return "unknown";
  }
}
