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

const CONFIG_KEY = "xmrig_proxy_config";
const THEME_KEY  = "dashboard_theme";

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
 * Apply backward-compat defaults without losing legitimately empty fields.
 * `??` (not `||`) so e.g. refreshInterval=0 is not silently rewritten to 10.
 */
function hydrateConnection(raw) {
  const config = JSON.parse(raw);
  return {
    apiUrl:          config.apiUrl          ?? "",
    apiToken:        config.apiToken        ?? "",
    remember:        config.remember        ?? true,
    refreshInterval: config.refreshInterval ?? 10,
  };
}

/**
 * Load connection configuration from localStorage first, then sessionStorage.
 * @returns {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number}|null}
 */
export function loadConfig() {
  let raw = localStorage.getItem(CONFIG_KEY);
  if (raw) {
    try { return hydrateConnection(raw); }
    catch { localStorage.removeItem(CONFIG_KEY); }
  }
  raw = sessionStorage.getItem(CONFIG_KEY);
  if (raw) {
    try { return hydrateConnection(raw); }
    catch { sessionStorage.removeItem(CONFIG_KEY); }
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
   Reactive getter (used by api.js, main.js)
   -------------------------------------------------------------------------- */

/**
 * @returns {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number}|null}
 */
export function getConfig() {
  return loadConfig();
}
