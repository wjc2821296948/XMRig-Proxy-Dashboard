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
const BACKGROUND_IMAGE_KEY = "dashboard_background_image";
const WRITE_KEY     = "dashboard_write_access";
const PROFILES_KEY  = "xmrig_proxy_profiles";
const ACTIVE_PROFILE_KEY = "xmrig_proxy_active_profile";
const PROFILE_TOKENS_KEY = "xmrig_proxy_session_tokens";

let configCleanupWarningPending = false;
let storageRecoveryWarningPending = false;

/** Consume a warning raised when a failed storage transaction could not fully roll back. */
export function consumeStorageRecoveryWarning() {
  const pending = storageRecoveryWarningPending;
  storageRecoveryWarningPending = false;
  return pending;
}

/** Consume the warning raised when a corrupt config cannot be cleared. */
export function consumeConfigCleanupWarning() {
  const pending = configCleanupWarningPending;
  configCleanupWarningPending = false;
  return pending;
}

const MAX_CONFIG_SIZE = 100 * 1024;
const MAX_TOKEN_LENGTH = 4096;
const MAX_URL_LENGTH = 2048;
const MAX_PROFILE_NAME_LENGTH = 128;
const MAX_BACKGROUND_IMAGE_URL_LENGTH = 2048;
const MAX_BACKGROUND_DATA_URL_LENGTH = 1_800_000;
const BACKGROUND_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Storage access can throw in privacy-restricted contexts or at quota. */
function storageFor(kind) {
  try {
    return kind === "session" ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    return null;
  }
}

function safeGet(kind, key) {
  try { return storageFor(kind)?.getItem(key) ?? null; } catch { return null; }
}

function safeSet(kind, key, value) {
  try {
    const storage = storageFor(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch { return false; }
}

function safeRemove(kind, key) {
  try {
    const storage = storageFor(kind);
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch { return false; }
}

/** Read a storage entry without confusing an inaccessible store with a missing key. */
function readStorageEntry(kind, key) {
  try {
    const storage = storageFor(kind);
    if (!storage) return { ok: false, value: null };
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false, value: null };
  }
}

/**
 * Best-effort removal for a malformed saved connection. Some storage
 * implementations reject removeItem while still permitting setItem; blank
 * the key in that case so it no longer shadows a usable session config.
 */
function discardStoredConfig(kind) {
  if (safeRemove(kind, CONFIG_KEY)) return true;
  if (safeSet(kind, CONFIG_KEY, "")) return true;
  // Neither removal nor overwrite is possible. Keep the fallback path usable,
  // but let the UI tell the operator to clear the site's stored data manually.
  configCleanupWarningPending = true;
  return false;
}



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
  if (!cfg || typeof cfg !== "object") return false;

  let normalized;
  let serialized;
  try {
    const apiUrl = cfg.apiUrl;
    const apiToken = cfg.apiToken;
    if (typeof apiUrl !== "string" || apiUrl.length > MAX_URL_LENGTH || !isValidApiUrl(apiUrl)
        || typeof apiToken !== "string" || apiToken.length > MAX_TOKEN_LENGTH) {
      return false;
    }
    normalized = {
      ...cfg,
      // Missing is the old-schema default; explicit malformed values fail closed.
      remember: Object.hasOwn(cfg, "remember") ? cfg.remember === true : true,
    };
    serialized = JSON.stringify(normalized);
  } catch {
    return false;
  }
  if (serialized.length > MAX_CONFIG_SIZE) return false;

  if (normalized.remember) {
    // A rollback must know the exact previous values. Do not overwrite an
    // existing credential when a restricted storage context makes snapshots unreadable.
    const previousLocal = readStorageEntry("local", CONFIG_KEY);
    const previousSession = readStorageEntry("session", CONFIG_KEY);
    if (!previousLocal.ok || !previousSession.ok) return false;
    if (!safeSet("local", CONFIG_KEY, serialized)) return false;

    if (!safeRemoveOrReplace("session", CONFIG_KEY, "")) {
      // A blocked session store may be ignored only when we could verify that
      // no stale session config exists. If one exists, restore the old local
      // value, but never reactivate malformed credentials during that rollback.
      if (previousSession.value !== null) {
        if (!restoreStoredConfigEntry("local", previousLocal.value)) {
          storageRecoveryWarningPending = true;
        }
        // The stale session entry could not be removed or blanked, so the
        // failed save may leave an older credential available after refresh.
        storageRecoveryWarningPending = true;
        return false;
      }
    }
    return true;
  }

  // Prefer removing any persistent value before saving a session-only config.
  // If localStorage is blocked entirely, sessionStorage can still be usable;
  // only fail when a persistent value is readable but cannot be removed.
  if (!safeRemove("local", CONFIG_KEY) && safeGet("local", CONFIG_KEY) !== null) {
    return false;
  }
  return safeSet("session", CONFIG_KEY, serialized);
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  if (typeof profile.apiUrl !== "string" || profile.apiUrl.length > MAX_URL_LENGTH || !isValidApiUrl(profile.apiUrl)) return null;
  if (typeof profile.apiToken === "string" && profile.apiToken.length > MAX_TOKEN_LENGTH) return null;
  if (typeof profile.name === "string" && profile.name.length > MAX_PROFILE_NAME_LENGTH) return null;
  const id = typeof profile.id === "string" && profile.id.trim() ? profile.id.trim() : null;
  if (!id) return null;
  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : "Proxy";
  const refreshInterval = Math.min(120, Math.max(1, Number(profile.refreshInterval) || 10));
  return {
    id,
    name,
    apiUrl: profile.apiUrl,
    apiToken: typeof profile.apiToken === "string" ? profile.apiToken : "",
    // Preserve legacy default only when the field is absent; malformed flags fail closed.
    remember: Object.hasOwn(profile, "remember") ? profile.remember === true : true,
    refreshInterval,
  };
}

function readProfileTokens() {
  const raw = safeGet("session", PROFILE_TOKENS_KEY);
  if (!raw) return Object.create(null);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Object.create(null);
    }
    // Keep profile IDs as own data keys; never inherit values from Object.prototype.
    // Session storage is user-controlled and may contain malformed values from
    // old versions, devtools, or partial writes. Never hydrate a credential
    // unless it is a bounded string, otherwise object values or oversized tokens
    // could bypass normalizeProfile's token validation.
    const tokens = Object.create(null);
    for (const [id, token] of Object.entries(parsed)) {
      if (typeof token === "string" && token.length <= MAX_TOKEN_LENGTH) {
        tokens[id] = token;
      }
    }
    return tokens;
  } catch {
    return Object.create(null);
  }
}

function writeProfileTokens(tokens) {
  return safeSet("session", PROFILE_TOKENS_KEY, JSON.stringify(tokens));
}

function readProfiles() {
  const raw = safeGet("local", PROFILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tokens = readProfileTokens();
    return parsed
      .map(normalizeProfile)
      .filter(Boolean)
      .map(profile => profile.remember
        ? profile
        : { ...profile, apiToken: Object.hasOwn(tokens, profile.id) ? tokens[profile.id] : "" });
  } catch {
    return [];
  }
}

function writeProfiles(profiles) {
  const persistent = profiles.map(profile => {
    if (profile.remember) return profile;
    const { apiToken, ...metadata } = profile;
    return metadata;
  });
  return safeSet("local", PROFILES_KEY, JSON.stringify(persistent));
}

/**
 * Load all saved Proxy profiles, lazily migrating the legacy single config.
 */
export function loadProfiles() {
  const profiles = readProfiles();
  if (profiles.length > 0) return profiles;

  const legacy = loadConfig();
  if (!legacy) return [];

  const migrated = [{ id: "legacy-1", name: "Proxy 1", ...legacy }];
  writeProfiles(migrated);
  if (!legacy.remember) {
    const tokens = readProfileTokens();
    tokens[migrated[0].id] = legacy.apiToken;
    writeProfileTokens(tokens);
  }
  safeSet("local", ACTIVE_PROFILE_KEY, migrated[0].id);
  return migrated;
}

/** Distinguish a missing profile from an inaccessible profile store. */
export function getProfileById(id) {
  const storedProfiles = readStorageEntry("local", PROFILES_KEY);
  if (!storedProfiles.ok) return { status: "storage-unavailable", profile: null };
  const profile = loadProfiles().find(item => item.id === id) || null;
  return profile
    ? { status: "found", profile }
    : { status: "not-found", profile: null };
}

/** Save or update one Proxy profile and make it active. */
export function saveProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  const normalized = normalizeProfile({
    ...profile,
    id: profile.id || `proxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  if (!normalized) return null;

  const profiles = loadProfiles();
  const index = profiles.findIndex(item => item.id === normalized.id);
  if (index >= 0) profiles[index] = normalized;
  else profiles.push(normalized);

  // Capture raw values before touching multiple storage keys. Browser storage
  // has no transaction API, so a complete readable snapshot is required before
  // changing a profile. Otherwise we cannot safely promise rollback.
  const entries = [
    ["profiles", "local", PROFILES_KEY],
    ["activeId", "local", ACTIVE_PROFILE_KEY],
    ["localConfig", "local", CONFIG_KEY],
    ["sessionConfig", "session", CONFIG_KEY],
    ["tokens", "session", PROFILE_TOKENS_KEY],
  ];
  const previous = captureStorageEntries(entries);
  if (!previous) return null;
  const warningBeforeMutation = storageRecoveryWarningPending;
  const restore = () => {
    const restored = restoreStorageEntries(previous, entries);
    if (restored) storageRecoveryWarningPending = warningBeforeMutation;
    return restored;
  };

  const tokens = readProfileTokens();
  if (normalized.remember) {
    // Do not depend on sessionStorage unless there is actually a stale token
    // to remove for this profile ID.
    if (Object.hasOwn(tokens, normalized.id)) {
      delete tokens[normalized.id];
      if (!writeProfileTokens(tokens)) return null;
    }
  } else {
    tokens[normalized.id] = normalized.apiToken;
    if (!writeProfileTokens(tokens)) return null;
  }

  if (!writeProfiles(profiles)) {
    if (!restore()) storageRecoveryWarningPending = true;
    return null;
  }
  if (!saveConfig(normalized)) {
    if (!restore()) storageRecoveryWarningPending = true;
    return null;
  }
  if (!safeSet("local", ACTIVE_PROFILE_KEY, normalized.id)) {
    if (!restore()) storageRecoveryWarningPending = true;
    return null;
  }
  return normalized;
}
/** Remove a saved Proxy profile. The last profile cannot be removed. */
export function deleteProfile(id) {
  const profiles = loadProfiles();
  if (profiles.length <= 1) return false;
  const removed = profiles.find(profile => profile.id === id);
  if (!removed) return false;

  const next = profiles.filter(profile => profile.id !== id);
  const originalTokens = readProfileTokens();
  const nextTokens = Object.assign(Object.create(null), originalTokens);
  const hadSessionToken = Object.hasOwn(originalTokens, id);
  delete nextTokens[id];

  const entries = [
    ["profiles", "local", PROFILES_KEY],
    ["activeId", "local", ACTIVE_PROFILE_KEY],
    ["localConfig", "local", CONFIG_KEY],
    ["sessionConfig", "session", CONFIG_KEY],
    ["tokens", "session", PROFILE_TOKENS_KEY],
  ];
  const previous = captureStorageEntries(entries);
  if (!previous) return false;
  const warningBeforeMutation = storageRecoveryWarningPending;
  const previousActiveId = previous.activeId;
  const wasActive = previousActiveId === id;

  // No Storage API offers a transaction across localStorage/sessionStorage.
  // Attempt every restoration, inspect the aggregate result, and surface a
  // warning if even one key cannot be restored; callers must not imply the
  // previous state was recovered in that case.
  const rollback = () => {
    const restored = restoreStorageEntries(previous, entries);
    if (restored) storageRecoveryWarningPending = warningBeforeMutation;
    return restored;
  };
  const failAndRollback = () => {
    if (!rollback()) storageRecoveryWarningPending = true;
    return false;
  };

  if (wasActive) {
    if (!saveConfig(next[0])) return failAndRollback();
    if (!safeSet("local", ACTIVE_PROFILE_KEY, next[0].id)) return failAndRollback();
  }

  if (!writeProfiles(next)) return failAndRollback();
  if (hadSessionToken && !writeProfileTokens(nextTokens)) return failAndRollback();

  return true;
}
/** Select a saved Proxy profile and make its connection config active. */
export function setActiveProfile(id) {
  const profile = loadProfiles().find(item => item.id === id);
  if (!profile) return null;

  const entries = [
    ["activeId", "local", ACTIVE_PROFILE_KEY],
    ["localConfig", "local", CONFIG_KEY],
    ["sessionConfig", "session", CONFIG_KEY],
  ];
  const previous = captureStorageEntries(entries);
  if (!previous) return null;
  const warningBeforeMutation = storageRecoveryWarningPending;
  const restore = () => {
    const restored = restoreStorageEntries(previous, entries);
    if (restored) storageRecoveryWarningPending = warningBeforeMutation;
    return restored;
  };

  // Save the connection before switching the active ID. If either storage
  // operation fails, restore the raw prior entries; do not reserialize an
  // old config that might be malformed or have a different remember mode.
  if (!saveConfig(profile)) {
    if (!restore()) storageRecoveryWarningPending = true;
    return null;
  }
  if (!safeSet("local", ACTIVE_PROFILE_KEY, profile.id)) {
    if (!restore()) storageRecoveryWarningPending = true;
    return null;
  }
  return profile;
}

/** @returns {string|null} */
export function loadActiveProfileId() {
  return safeGet("local", ACTIVE_PROFILE_KEY);
}

/** @returns {object|null} */
export function getActiveProfile() {
  const profiles = loadProfiles();
  const activeId = loadActiveProfileId();
  if (!activeId) return null;
  return profiles.find(profile => profile.id === activeId) || null;
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
  try {
    const parsed = new URL(url);
    // The dashboard only talks to HTTP APIs. Reject other schemes and
    // embedded credentials before persisting any profile, even when callers
    // bypass the UI validation.
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
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
  if (typeof config.apiUrl !== "string" || config.apiUrl.length > MAX_URL_LENGTH
      || !isValidApiUrl(config.apiUrl)) return null;
  if (config.apiToken != null
      && (typeof config.apiToken !== "string" || config.apiToken.length > MAX_TOKEN_LENGTH)) {
    return null;
  }
  const refreshInterval = config.refreshInterval ?? 10;
  return {
    apiUrl:          config.apiUrl,
    apiToken:        typeof config.apiToken === "string" ? config.apiToken : "",
    remember:        Object.hasOwn(config, "remember") ? config.remember === true : true,
    refreshInterval: Math.min(120, Math.max(1, Number(refreshInterval) || 10)),
  };
}

/**
 * Load connection configuration from localStorage first, then sessionStorage.
 * @returns {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number}|null}
 */
export function loadConfig() {
  let raw = safeGet("local", CONFIG_KEY);
  if (raw) {
    try {
      const hydrated = hydrateConnection(raw);
      if (hydrated) {
        if (hydrated.remember) return hydrated;

        // A session-only config must not remain in localStorage. Persist its
        // temporary form first, then invalidate the persistent copy.
        let savedToSession = false;
        try {
          savedToSession = safeSet("session", CONFIG_KEY, JSON.stringify(hydrated));
        } catch {
          savedToSession = false;
        }
        const clearedLocal = discardStoredConfig("local");
        if (savedToSession && clearedLocal) return hydrated;
        return null;
      }
    } catch {
      // JSON parse failure — fall through to sessionStorage.
    }
    discardStoredConfig("local");
  }
  raw = safeGet("session", CONFIG_KEY);
  if (raw) {
    try {
      const hydrated = hydrateConnection(raw);
      if (hydrated) return hydrated;
    } catch {
      // JSON parse failure — return null below.
    }
    discardStoredConfig("session");
  }
  return null;
}

function safeRemoveOrReplace(kind, key, replacement) {
  if (safeRemove(kind, key)) return true;
  // Some stores allow writes but reject removeItem. Replace credentials with
  // an inert value in that case; a blocked store still reports failure.
  return safeSet(kind, key, replacement);
}

function restoreStorageEntry(kind, key, previousValue) {
  if (previousValue !== null) return safeSet(kind, key, previousValue);
  return safeRemoveOrReplace(kind, key, "");
}

/** Restore a previous config only if it is still safe to reactivate. */
function restoreStoredConfigEntry(kind, previousValue) {
  if (previousValue === null) return restoreStorageEntry(kind, CONFIG_KEY, null);
  let hydrated;
  try { hydrated = hydrateConnection(previousValue); } catch { hydrated = null; }
  if (!hydrated || (kind === "local" && !hydrated.remember)) {
    return safeRemoveOrReplace(kind, CONFIG_KEY, "");
  }
  return safeSet(kind, CONFIG_KEY, previousValue);
}

/** Snapshot named storage entries and fail before mutation if any cannot be read. */
function captureStorageEntries(entries) {
  const snapshot = Object.create(null);
  for (const [name, kind, key] of entries) {
    const current = readStorageEntry(kind, key);
    if (!current.ok) return null;
    snapshot[name] = current.value;
  }
  return snapshot;
}

/** Attempt every restore, returning false and recording a warning on partial rollback. */
function restoreStorageEntries(snapshot, entries) {
  if (!snapshot) return false;
  const results = entries.map(([name, kind, key]) => {
    const previousValue = snapshot[name];
    const current = readStorageEntry(kind, key);
    // Storage writes are atomic: a set/remove that throws leaves its key
    // unchanged. Skip untouched entries so a blocked store does not create a
    // false partial-rollback warning when no restoration was actually needed.
    if (current.ok && current.value === previousValue) return true;
    return key === CONFIG_KEY
      ? restoreStoredConfigEntry(kind, previousValue)
      : restoreStorageEntry(kind, key, previousValue);
  });
  const restored = results.every(Boolean);
  if (!restored) storageRecoveryWarningPending = true;
  return restored;
}

/** Clear connection config from both storages (logout). Does NOT touch theme. */
export function clearConfig() {
  // Attempt every cleanup even if one store is blocked. When removal is denied
  // but writes work, overwrite credential-bearing values with inert values.
  const results = [
    safeRemoveOrReplace("local", CONFIG_KEY, ""),
    safeRemoveOrReplace("session", CONFIG_KEY, ""),
    safeRemoveOrReplace("session", PROFILE_TOKENS_KEY, "{}"),
    safeRemoveOrReplace("local", ACTIVE_PROFILE_KEY, ""),
  ];
  return results.every(Boolean);
}

/* --------------------------------------------------------------------------
   UI preferences (theme)
   -------------------------------------------------------------------------- */

const VALID_THEMES = new Set(["dark", "light", "system"]);

/**
 * @param {"dark" | "light" | "system"} theme
 */
export function saveTheme(theme) {
  if (!VALID_THEMES.has(theme)) return false;
  return safeSet("local", THEME_KEY, theme);
}

/**
 * @returns {"dark" | "light" | "system"}
 */
export function loadTheme() {
  const raw = safeGet("local", THEME_KEY);
  return VALID_THEMES.has(raw) ? raw : "dark";
}

/** Clear the persisted theme preference. */
export function clearTheme() {
  safeRemove("local", THEME_KEY);
}

/**
 * Normalize a custom background image URL. HTTPS is required because the
 * dashboard itself is deployed over HTTPS; embedded credentials and oversized
 * values are rejected before the URL reaches CSS or localStorage.
 *
 * @param {unknown} value
 * @returns {string|null} Empty string means the default background.
 */
export function normalizeBackgroundImageUrl(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input) return "";
  if (input.startsWith("data:")) {
    return input.length <= MAX_BACKGROUND_DATA_URL_LENGTH && BACKGROUND_DATA_URL_PATTERN.test(input)
      ? input
      : null;
  }
  if (input.length > MAX_BACKGROUND_IMAGE_URL_LENGTH) return null;

  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.href.length <= MAX_BACKGROUND_IMAGE_URL_LENGTH ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Persist a validated HTTPS URL or compressed image data URL independently of connection credentials. */
export function saveBackgroundImage(value) {
  const normalized = normalizeBackgroundImageUrl(value);
  if (normalized === null) return false;
  return safeSet("local", BACKGROUND_IMAGE_KEY, normalized);
}

/** @returns {string} A validated HTTPS URL or image data URL, or empty string for the default. */
export function loadBackgroundImage() {
  const raw = safeGet("local", BACKGROUND_IMAGE_KEY);
  return normalizeBackgroundImageUrl(raw ?? "") ?? "";
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
  if (!target) return false;
  const map = readWriteAccessMap();
  map[target] = Boolean(enabled);
  return writeWriteAccessMap(map);
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
    return safeRemove("local", WRITE_KEY);
  }
  const map = readWriteAccessMap();
  if (target in map) {
    delete map[target];
    return writeWriteAccessMap(map);
  }
  return true;
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
  const raw = safeGet("local", WRITE_KEY);
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
  return safeSet("local", WRITE_KEY, JSON.stringify(map));
}

/* --------------------------------------------------------------------------
   Reactive getter (used by api.js, main.js)
   -------------------------------------------------------------------------- */

/**
 * @returns {{apiUrl:string, apiToken:string, remember:boolean, refreshInterval:number}|null}
 */
export function getConfig() {
  const active = getActiveProfile();
  return active || loadConfig();
}
