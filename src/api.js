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
 * @param {object} [options] Optional fetch options (method, body, etc.).
 * @returns {Promise<any>} Resolves with parsed JSON on success.
 */
export async function request(path, options = {}) {
  const cfg = getConfig();
  if (!cfg || !cfg.apiUrl || !cfg.apiToken) {
    throw new Error("API configuration missing");
  }

  const url = new URL(path, cfg.apiUrl).toString();
  const headers = new Headers(options.headers || {});
  // Fixed-length mask: replacing each token char with '*' would otherwise
  // reveal the token length to anyone who happens to scrape the console.
  console.debug(`API request → ${url} – Authorization: Bearer **********`);
  headers.set("Authorization", `Bearer ${cfg.apiToken}`);

  // 8-second timeout via the platform-native AbortSignal so the underlying
  // fetch is actually cancelled (Promise.race used to leave it draining).
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      method: options.method || "GET",
      headers,
      signal: timeoutSignal,
    });
    if (!response.ok) {
      // 401 / 403 trigger a logout flow upstream.
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  } catch (e) {
    // AbortSignal.timeout() throws a DOMException whose `name` is "TimeoutError"
    // (distinct from "AbortError" raised by AbortController.abort()). Browsers
    // that pre-date `AbortSignal.timeout` still throw "AbortError"; in that
    // case the upstream message is already a generic "The operation was
    // aborted" so we keep it. The point of this branch was always to label
    // timeout cancellations consistently — only relabel that case.
    if (e.name === "TimeoutError") {
      e.message = "Request timed out";
    }
    console.error(`API error (masked): ${e.message}`);
    throw e;
  }
}
