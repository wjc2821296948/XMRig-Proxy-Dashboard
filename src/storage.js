/**
 * storage.js – Browser storage abstraction for API configuration.
 *
 * Handles the "Remember Me" preference:
 *   - true  → localStorage (persists across browser restarts)
 *   - false → sessionStorage (cleared when the tab/window is closed)
 *
 * The stored object shape:
 *   { apiUrl: string, apiToken: string, remember: boolean, refreshInterval: number, theme: string }
 */

const STORAGE_KEY = "xmrig_proxy_config";

/**
 * Validate and sanitize loaded configuration.
 * @param {any} config - Raw parsed config object
 * @returns {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number, theme:string}|null}
 */
function validateConfig(config) {
  if (!config || typeof config !== 'object') return null;
  // Ensure required string fields exist
  const apiUrl = typeof config.apiUrl === 'string' ? config.apiUrl.trim() : '';
  const apiToken = typeof config.apiToken === 'string' ? config.apiToken : '';
  if (!apiUrl) return null;
  // Validate URL format
  try {
    new URL(apiUrl);
  } catch {
    return null;
  }
  // Validate refreshInterval
  const refreshInterval = Number(config.refreshInterval);
  if (!Number.isFinite(refreshInterval) || refreshInterval < 1 || refreshInterval > 120) {
    return null;
  }
  // Validate theme
  const theme = config.theme === 'light' ? 'light' : 'dark';
  // Validate remember
  const remember = Boolean(config.remember);
  return { apiUrl, apiToken, remember, refreshInterval, theme };
}

/**
 * Save configuration to the chosen storage.
 * @param {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number, theme:string}} cfg
 */
export function saveConfig(cfg) {
  const target = cfg.remember ? localStorage : sessionStorage;
  target.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/**
 * Load configuration from localStorage first, then sessionStorage.
 * @returns {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number, theme:string}|null}
 */
export function loadConfig() {
  // localStorage takes precedence (user explicitly chose "Remember Me")
  let raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const config = JSON.parse(raw);
      const validated = validateConfig(config);
      if (validated) return validated;
    } catch {
      // Fall through to sessionStorage
    }
    localStorage.removeItem(STORAGE_KEY);
  }
  // Fallback to sessionStorage
  raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const config = JSON.parse(raw);
      const validated = validateConfig(config);
      if (validated) return validated;
    } catch {
      // Fall through to null
    }
    sessionStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

/**
 * Clear configuration from both storages.
 */
export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Reactive getter used by other modules.
 * Always reads the latest value from storage.
 * @returns {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number, theme:string}|null}
 */
export function getConfig() {
  return loadConfig();
}
