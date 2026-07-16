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
function timeoutPromise(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out")), ms)
  );
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
  const maskedToken = cfg.apiToken.replace(/./g, "*");
  console.debug(`API request → ${url} – Authorization: Bearer ${maskedToken}`);
  headers.set("Authorization", `Bearer ${cfg.apiToken}`);

  const fetchOpts = {
    method: "GET",
    ...options,
    headers,
  };

  try {
    // 8‑second timeout for the XMRig‑Proxy request.
    const response = await Promise.race([fetch(url, fetchOpts), timeoutPromise(8000)]);
    if (!response.ok) {
      // 401 / 403 trigger a logout flow upstream.
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const data = await response.json();
    return data;
  } catch (e) {
    // Normalise network errors.
    if (e.name === "AbortError") {
      e.message = "Network request aborted";
    }
    console.error(`API error (masked): ${e.message}`);
    throw e;
  }
}
