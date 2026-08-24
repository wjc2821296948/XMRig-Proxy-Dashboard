/**
 * storage.js – Browser storage abstraction.
 *
 * Two concerns, separated so each has a single source of truth:
 *
 * 1. XMRig Proxy connection config (apiUrl, apiToken, remember, refreshInterval)
 *    - "Remember Me" = true  → localStorage (persists across browser restarts)
 *    - "Remember Me" = false → sessionStorage (cleared with the tab)
 *
 * 2. UI preferences (theme)
 *    - Always localStorage — a UI preference should not depend on which tab
 *      you happen to be in, and it is independent of whether the
 *      connection is in "Remember Me" mode.
 *
 *  Why connection config and theme are separate keys:
 *  - `clearConfig()` (logout) should NOT wipe the theme the user picked.
 *  - The connection reloads every 10 s; the theme does not. Mixing them
 *    invites desync, which the previous version suffered from.
 */

const CONFIG_KEY    = "xmrig_proxy_config";
const THEME_KEY     = "dashboard_theme";
const WRITE_KEY     = "dashboard_write_access";

/* --------------------------------------------------------------------------
   Connection config
   -------------------------------------------------------------------------- */

/**
 * Save connection configuration to the chosen storage.
 *
 * Stale entries in the *other* storage are cleared as well — otherwise a
 * user who previously kept "Remember Me" and later disabled it would have
 * the older localStorage entry silently override the new sessionStorage
 * one on the next page load (loadConfig() reads localStorage first).
 *
 * @param {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number}} cfg
 */
export function saveConfig(cfg) {
  const target  = cfg.remember ? localStorage : sessionStorage;
  const sibling = cfg.remember ? sessionStorage : localStorage;
  sibling.removeItem(CONFIG_KEY);
  target.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

/**
 * Validate a URL is well-formed. Returns false for non-strings, empty
 * strings, or any value `new URL(...)` rejects. We don't reject the
 * config on URL failure here — the caller (loadConfig) decides whether
 * a missing/empty URL means "no config yet" vs. "show the connection
 * form". We just say: this URL is load-bearing and must parse.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
function isValidApiUrl(url) {
  if (typeof url !== "string" || url.length === 0) return false;
  try { new URL(url); return true; } catch { return false; }
}

/**
 * Apply backward-compat defaults without losing legitimately empty fields.
 * `??` (not `||`) so e.g. refreshInterval=0 is not silently rewritten to 10.
 *
 * Returns null when the config is unrecoverable — for example, when the
 * persisted `apiUrl` no longer parses. We deliberately do NOT reject
 * empty `apiToken` (some proxies don't require one) or `remember: false`,
 * because those are valid user choices that should round-trip cleanly.
 */
function hydrateConnection(raw) {
  const config = JSON.parse(raw);
  if (!isValidApiUrl(config.apiUrl)) return null;
  const refreshInterval = config.refreshInterval ?? 10;
  return {
    apiUrl:          config.apiUrl,
    apiToken:        config.apiToken        ?? "",
    remember:        config.remember        ?? true,
    refreshInterval: Math.min(120, Math.max(1, Number(refreshInterval) || 10)),
  };
}

/**
 * Load connection configuration from localStorage first, then sessionStorage.
 * @returns {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number}|null}
 */
export function loadConfig() {
  let raw = localStorage.getItem(CONFIG_KEY);
  if (raw) {
    try {
      const hydrated = hydrateConnection(raw);
      if (hydrated) return hydrated;
    } catch {
      // JSON parse failure — fall through to sessionStorage.
    }
    localStorage.removeItem(CONFIG_KEY);
  }
  raw = sessionStorage.getItem(CONFIG_KEY);
  if (raw) {
    try {
      const hydrated = hydrateConnection(raw);
      if (hydrated) return hydrated;
    } catch {
      // JSON parse failure — return null below.
    }
    sessionStorage.removeItem(CONFIG_KEY);
  }
  return null;
}

/** Clear connection config from both storages (logout). Does NOT touch theme. */
export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  sessionStorage.removeItem(CONFIG_KEY);
}

/* --------------------------------------------------------------------------
   UI preferences (theme)
   -------------------------------------------------------------------------- */

const VALID_THEMES = new Set(["dark", "light"]);

/**
 * @param {"dark" | "light"} theme
 */
export function saveTheme(theme) {
  if (!VALID_THEMES.has(theme)) return;
  localStorage.setItem(THEME_KEY, theme);
}

/**
 * @returns {"dark" | "light"}
 */
export function loadTheme() {
  const raw = localStorage.getItem(THEME_KEY);
  return VALID_THEMES.has(raw) ? raw : "dark";
}

/** Clear the persisted theme preference. */
export function clearTheme() {
  localStorage.removeItem(THEME_KEY);
}

/* --------------------------------------------------------------------------
   Write-access flag

   Discovered by the dashboard on every successful connect by probing
   GET /1/config (restricted mode blocks that endpoint). Persisted so the
   mode picker doesn't need to re-probe on every render and so the ribbon
   state survives a tab refresh.

   Stored under its own key (separate from CONFIG_KEY) so that logging out
   does not erase a freshly-probed write-access result, and so that
   clearing the connection does not invalidate the probe.

   The persisted value is keyed by the proxy URL it was probed against,
   not stored as a single global flag. Two proxies with different
   restricted settings cannot share a flag, and a URL swap via devtools
   doesn't leave the previous proxy's verdict behind.
   -------------------------------------------------------------------------- */

/**
 * Read the persisted write-access flag for the currently-connected proxy.
 * Returns false (locked) when:
 *   - no config is saved
 *   - no probe result has ever been recorded for this URL
 *   - the previous probe failed (we never assume write permission)
 *
 * @param {string} [apiUrl]  Proxy URL to look up. Defaults to the
 *                           currently-saved connection's URL.
 * @returns {boolean}
 */
export function loadWriteAccess(apiUrl) {
  const target = apiUrl ?? getConfig()?.apiUrl;
  if (!target) return false;
  const map = readWriteAccessMap();
  return map[target] === true;
}

/**
 * Save the discovered write-access state of the currently-connected proxy.
 * Non-boolean inputs are coerced via `Boolean(...)` so a stray truthy
 * non-bool (e.g. a `Promise`, an object) cannot silently enable writes.
 *
 * @param {boolean} enabled  true when GET /1/config returned 2xx.
 * @param {string} [apiUrl]  Proxy URL this verdict applies to. Defaults
 *                           to the currently-saved connection's URL.
 */
export function saveWriteAccess(enabled, apiUrl) {
  const target = apiUrl ?? getConfig()?.apiUrl;
  if (!target) return;
  const map = readWriteAccessMap();
  map[target] = Boolean(enabled);
  writeWriteAccessMap(map);
}

/**
 * Forget the write-access state for the currently-connected proxy.
 * Removes only that URL's entry so an unrelated proxy's verdict is
 * preserved (e.g. operator toggles between two proxies).
 *
 * @param {string} [apiUrl]  Proxy URL to forget. Defaults to the
 *                           currently-saved connection's URL.
 */
export function clearWriteAccess(apiUrl) {
  const target = apiUrl ?? getConfig()?.apiUrl;
  if (!target) {
    // No URL provided and no config saved — clear everything for safety.
    localStorage.removeItem(WRITE_KEY);
    return;
  }
  const map = readWriteAccessMap();
  if (target in map) {
    delete map[target];
    writeWriteAccessMap(map);
  }
}

/* Write-access storage format:
 *
 *   { "http://proxy-a:8080": true, "http://proxy-b:8080": false }
 *
 * JSON instead of many per-URL keys so a single `removeItem` is enough
 * to fully wipe, and so cross-URL cleanup (e.g. logging out completely)
 * is one operation.
 */

function readWriteAccessMap() {
  const raw = localStorage.getItem(WRITE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    // Legacy/corrupt entry — treat as empty rather than crash the picker.
    return {};
  }
}

function writeWriteAccessMap(map) {
  localStorage.setItem(WRITE_KEY, JSON.stringify(map));
}

/* --------------------------------------------------------------------------
   Reactive getter (used by api.js, main.js)
   -------------------------------------------------------------------------- */

/**
 * @returns {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number}|null}
 */
export function getConfig() {
  return loadConfig();
}
