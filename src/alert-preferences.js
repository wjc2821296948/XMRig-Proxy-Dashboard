import { normalizeAlertConfig } from "./alert-rules.js";

const ALERT_SETTINGS_KEY = "xmrig_proxy_alert_settings";

function normalizeAlertPreferences(input = {}) {
  const rules = normalizeAlertConfig(input);
  return { ...rules, notificationsEnabled: input?.notificationsEnabled === true };
}

function resolveStorage(storageRef) {
  if (storageRef !== undefined) return storageRef;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Load browser-local alert thresholds without ever reading connection credentials. */
export function loadAlertSettings(storageRef) {
  const storage = resolveStorage(storageRef);
  if (!storage) return normalizeAlertPreferences();
  try {
    const raw = storage.getItem(ALERT_SETTINGS_KEY);
    if (!raw) return normalizeAlertPreferences();
    return normalizeAlertPreferences(JSON.parse(raw));
  } catch {
    return normalizeAlertPreferences();
  }
}

/** Persist only normalized alert thresholds and cooldown; never Proxy connection data. */
export function saveAlertSettings(input, storageRef) {
  const storage = resolveStorage(storageRef);
  if (!storage || !input || typeof input !== "object") return false;
  try {
    const normalized = normalizeAlertPreferences(input);
    storage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}
