import { getLocale, normalizeLocale } from "./i18n.js";

const MESSAGE_BY_LOCALE = Object.freeze({
  "zh-CN": Object.freeze({
    "low-hashrate": "算力低于你设置的阈值。",
    "low-miners": "活跃矿工数量低于你设置的阈值。",
    "high-rejection-rate": "拒绝份额比例高于你设置的阈值。",
  }),
  en: Object.freeze({
    "low-hashrate": "Hashrate is below your configured threshold.",
    "low-miners": "Active miner count is below your configured threshold.",
    "high-rejection-rate": "Rejected-share ratio is above your configured threshold.",
  }),
});

const VALID_PERMISSIONS = new Set(["default", "granted", "denied"]);

function resolveNotificationApi(notificationApi) {
  if (notificationApi !== undefined) return notificationApi;
  try {
    return globalThis.Notification ?? null;
  } catch {
    return null;
  }
}

/** Read permission without prompting the user. */
export function getBrowserNotificationPermission(notificationApi) {
  const api = resolveNotificationApi(notificationApi);
  if (typeof api !== "function" || typeof api.requestPermission !== "function") return "unsupported";
  return VALID_PERMISSIONS.has(api.permission) ? api.permission : "default";
}

/** Must only be called from an explicit user interaction. */
export async function requestBrowserNotificationPermission(notificationApi) {
  const api = resolveNotificationApi(notificationApi);
  if (typeof api !== "function" || typeof api.requestPermission !== "function") return "unsupported";
  try {
    const permission = await api.requestPermission();
    return VALID_PERMISSIONS.has(permission) ? permission : "default";
  } catch {
    return "error";
  }
}

/** Dispatch a generic alert message; never include Proxy URLs, tokens, or raw API data. */
export function sendAlertNotification(alert, { notificationApi, locale = getLocale() } = {}) {
  const api = resolveNotificationApi(notificationApi);
  if (getBrowserNotificationPermission(api) !== "granted" || !alert || typeof alert.id !== "string") return false;
  // Match the dashboard's supported locales and Simplified Chinese default fallback.
  const language = normalizeLocale(locale);
  const body = MESSAGE_BY_LOCALE[language][alert.id];
  if (!body) return false;

  try {
    new api("XMRig Proxy Dashboard", {
      body,
      tag: `xmrig-proxy-alert-${alert.id}`,
      renotify: false,
    });
    return true;
  } catch {
    return false;
  }
}
