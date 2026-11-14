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
    "network.offline": "浏览器报告当前处于离线状态；这并不能说明 Proxy API 是否可达。",
    "network.online": "浏览器报告网络连接已恢复。",
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
    "network.offline": "Your browser reports that it is offline. This does not indicate whether the Proxy API is reachable.",
    "network.online": "Your browser reports that it is back online.",
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
  const recognized = original === "en" || original.startsWith("en-")
    || original === "zh" || original.startsWith("zh-");
  if (!recognized) return false;
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
  const languageMessages = MESSAGES[language];
  const defaultMessages = MESSAGES[DEFAULT_LOCALE];
  const template = (Object.hasOwn(languageMessages, source) ? languageMessages[source] : undefined)
    ?? (Object.hasOwn(defaultMessages, source) ? defaultMessages[source] : undefined)
    ?? source;
  if (!values || typeof values !== "object") return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    return typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
      ? String(value)
      : match;
  });
}

export function listTranslations(locale = getLocale()) {
  return { ...MESSAGES[normalizeLocale(locale)] };
}
