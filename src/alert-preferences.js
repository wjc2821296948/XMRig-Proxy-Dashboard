import { normalizeAlertConfig } from "./alert-rules.js";

const ALERT_SETTINGS_KEY = "xmrig_proxy_alert_settings";

/**
 * Parse an optional numeric threshold from a number input.
 * Browsers can sanitize an unparseable user entry to an empty value while
 * exposing the invalid state through validity.badInput. Keep that distinct
 * from an intentionally empty field, which means the threshold is disabled.
 */
export function readOptionalThresholdInput(input) {
  if (!input || input.validity?.badInput) return Number.NaN;
  const raw = String(input.value ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
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
  if (!storage) return normalizeAlertConfig();
  try {
    const raw = storage.getItem(ALERT_SETTINGS_KEY);
    if (!raw) return normalizeAlertConfig();
    return normalizeAlertConfig(JSON.parse(raw));
  } catch {
    return normalizeAlertConfig();
  }
}

/** Persist only normalized alert thresholds and cooldown; never Proxy connection data. */
export function saveAlertSettings(input, storageRef) {
  const storage = resolveStorage(storageRef);
  if (!storage || !input || typeof input !== "object") return false;
  try {
    const normalized = normalizeAlertConfig(input);
    storage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}
