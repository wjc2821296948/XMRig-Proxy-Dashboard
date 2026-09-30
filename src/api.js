/**
 * api.js – Dashboard adapter for xmrig-proxy-client.
 *
 * The reusable transport and write-access probe live in the package.
 * This file only adapts the package to the dashboard's existing storage API.
 */

import { XMRigProxyClient } from "./xmrig-proxy-client.js";
import { getConfig } from "./storage.js";

const REQUEST_TIMEOUT_MS = 8000;

function createClient() {
  const cfg = getConfig();
  if (!cfg || !cfg.apiUrl || !cfg.apiToken) {
    throw new Error("API configuration missing");
  }

  return new XMRigProxyClient({
    url: cfg.apiUrl,
    token: cfg.apiToken,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
}

/**
 * Compatibility wrapper kept so the dashboard's UI flow does not need to
 * know about connection storage. The actual HTTP implementation is owned by
 * xmrig-proxy-client.
 */
export function request(path, options = {}) {
  return createClient().request(path, options);
}

/**
 * Probe the configured Proxy for write access without issuing a write request.
 */
export function probeWriteAccess() {
  return createClient().probeWriteAccess();
}
