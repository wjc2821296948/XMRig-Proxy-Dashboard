/**
 * Lightweight localization foundation for the browser-only dashboard.
 *
 * This module has no framework/network dependency. Callers should render
 * translated strings as text nodes or through textContent, never as raw HTML.
 */
export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "en"]);
export const LOCALE_STORAGE_KEY = "dashboard_locale";

const MESSAGES = Object.freeze({
  "zh-CN": Object.freeze({
    "app.title": "XMRig Proxy Dashboard",
    "network.offline": "网络连接已断开。网络恢复后，仪表盘数据将继续更新。",
    "network.online": "网络连接已恢复。",
    "refresh.now": "立即刷新",
    "refresh.loading": "刷新中…",
    "refresh.failed": "监控数据刷新失败。",
    "settings.title": "设置",
    "status.waiting": "等待中",
    "status.online": "在线",
    "status.offline": "离线",
  }),
  en: Object.freeze({
    "app.title": "XMRig Proxy Dashboard",
    "network.offline": "Network connection lost. Dashboard data will refresh after connectivity is restored.",
    "network.online": "Network connection restored.",
    "refresh.now": "Refresh now",
    "refresh.loading": "Refreshing…",
    "refresh.failed": "Unable to refresh dashboard data.",
    "settings.title": "Settings",
    "status.waiting": "Waiting",
    "status.online": "Online",
    "status.offline": "Offline",
  }),
});

export function normalizeLocale(value) {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const normalized = value.trim().toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "zh-cn" || normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  return DEFAULT_LOCALE;
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function getLocale(storage = defaultStorage()) {
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY);
    return stored === null || stored === undefined ? DEFAULT_LOCALE : normalizeLocale(stored);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function saveLocale(locale, storage = defaultStorage()) {
  if (typeof locale !== "string" || !storage) return false;
  const original = locale.trim().toLowerCase();
  if (!["en", "en-us", "en-gb", "zh", "zh-cn", "zh-hans", "zh-hans-cn"].includes(original)) {
    return false;
  }
  try {
    storage.setItem(LOCALE_STORAGE_KEY, normalizeLocale(locale));
    return true;
  } catch {
    return false;
  }
}

export function translate(key, locale = getLocale(), values = {}) {
  const language = normalizeLocale(locale);
  const source = typeof key === "string" ? key : "";
  const template = MESSAGES[language][source] ?? MESSAGES[DEFAULT_LOCALE][source] ?? source;
  if (!values || typeof values !== "object") return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    const value = values[name];
    return typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
      ? String(value)
      : match;
  });
}

export function listTranslations(locale = getLocale()) {
  return { ...MESSAGES[normalizeLocale(locale)] };
}
