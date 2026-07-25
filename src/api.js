/**
 * api.js – Centralised XMRig‑Proxy API client
 *
 * Provides a single `request` function that automatically prefixes the base URL,
 * injects the `Authorization: Bearer <token>` header, applies a timeout and
 * normalises error handling.
 *
 * The token is never logged in plain text – any debug output replaces the token
 * value with `Bearer **********`.
 */

import { getConfig } from "./storage.js";

/**
 * Helper to create a timeout‑aware promise.
 */
function createTimeoutController(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // Caller is responsible for clearTimeout in the finally block via the
  // `timer` we expose on the controller -- wrap separately so the timer
  // is always cleaned up.
  controller._timer = timer;
  return controller;
}

/**
 * Central request wrapper.
 *
 * @param {string} path   Path relative to the XMRig‑Proxy API base (e.g. "/1/summary").
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
  // Mask token in logs – do not expose raw value.
  // Fixed-length mask: a per-char '*' reveals the token length to anyone
  // who happens to scrape the console. Keep this constant.
  const maskedToken = "**********";
  console.debug(`API request → ${url} – Authorization: Bearer ${maskedToken}`);
  headers.set("Authorization", `Bearer ${cfg.apiToken}`);

  const fetchOpts = {
    method: "GET",
    ...options,
    headers,
  };

  // 8‑second timeout for the XMRig‑Proxy request. We use a real AbortController
  // so the underlying fetch is cancelled when the timeout fires -- the
  // previous Promise.race handler rejected the wrapper but left the
  // connection draining in the background.
  const timeoutController = createTimeoutController(8000);
  try {
    const response = await fetch(url, {
      ...fetchOpts,
      signal: timeoutController.signal,
    });
    if (!response.ok) {
      // 401 / 403 trigger a logout flow upstream.
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const data = await response.json();
    return data;
  } catch (e) {
    // AbortError may come from either an explicit caller abort or our
    // timeout firing -- normalise the timeout case to a friendlier message.
    if (e.name === "AbortError") {
      e.message = "Request timed out";
    }
    console.error(`API error (masked): ${e.message}`);
    throw e;
  } finally {
    clearTimeout(timeoutController._timer);
  }
}
