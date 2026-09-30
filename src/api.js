/**
 * api.js – Dashboard adapter for xmrig-proxy-client.
 *
 * The package owns HTTP transport, authentication headers, timeout handling,
 * and write-access probing. This adapter owns dashboard connection storage
 * and reuses one client instance for the active connection.
 */

import { XMRigProxyClient } from "./xmrig-proxy-client.js";
import { getConfig } from "./storage.js";

const REQUEST_TIMEOUT_MS = 8000;

let cachedClient = null;
let cachedFingerprint = null;

function getClient() {
  const cfg = getConfig();
  if (!cfg || !cfg.apiUrl || !cfg.apiToken) {
    throw new Error("API configuration missing");
  }

  const fingerprint = JSON.stringify([cfg.apiUrl, cfg.apiToken]);

  if (!cachedClient || cachedFingerprint !== fingerprint) {
    cachedClient = new XMRigProxyClient({
      url: cfg.apiUrl,
      token: cfg.apiToken,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    cachedFingerprint = fingerprint;
  }

  return cachedClient;
}

/**
 * Compatibility wrapper kept so the dashboard's UI flow does not need to
 * know about connection storage. The actual HTTP implementation is owned by
 * xmrig-proxy-client.
 */
export function request(path, options = {}) {
  return getClient().request(path, options);
}

/**
 * Probe the configured Proxy for write access without issuing a write request.
 */
export function probeWriteAccess() {
  return getClient().probeWriteAccess();
}

/**
 * Drop the cached client after changing connection credentials.
 */
export function resetClient() {
  cachedClient = null;
  cachedFingerprint = null;
}
