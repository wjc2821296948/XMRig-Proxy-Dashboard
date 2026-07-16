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
      // Ensure backward compatibility with defaults
      return {
        apiUrl: config.apiUrl || "",
        apiToken: config.apiToken || "",
        remember: config.remember || true,
        refreshInterval: config.refreshInterval || 10,
        theme: config.theme || 'dark'
      };
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  // Fallback to sessionStorage
  raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const config = JSON.parse(raw);
      return {
        apiUrl: config.apiUrl || "",
        apiToken: config.apiToken || "",
        remember: config.remember || true,
        refreshInterval: config.refreshInterval || 10,
        theme: config.theme || 'dark'
      };
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
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