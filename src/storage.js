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
    if (!previousLocal.ok) return false;
    const previousSession = readStorageEntry("session", CONFIG_KEY);
    if (!previousSession.ok) {
      // localStorage wins over sessionStorage during loadConfig(). When session
      // storage is inaccessible, writing the remembered value locally is safe;
      // it cannot be shadowed by an unreadable session-only value.
      return safeSet("local", CONFIG_KEY, serialized);
    }
    if (!safeSet("local", CONFIG_KEY, serialized)) return false;

    if (!safeRemoveOrReplace("session", CONFIG_KEY, "")) {
      // A blocked session store may be ignored only when we could verify that
      // no stale session config exists. If one exists, restore the old local
      // value, but never reactivate malformed credentials during that rollback.
      if (previousSession.value !== null) {
        // Best-effort restoration may fail, and an uncleared session config
        // may still shadow the remembered value after refresh; either way,
        // the caller must be warned that the connection state may be stale.
        restoreStoredConfigEntry("local", previousLocal.value);
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
  const refreshInterval = Math.min(120, Math.max(1, Math.trunc(Number(profile.refreshInterval) || 10)));
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
  try {
    // Normalize legacy values first, then enforce the safe export/import schema
    // for new writes. Prototype-like IDs remain safe because token maps use null prototypes.
    validateImportedProfiles([normalized]);
  } catch {
    return null;
  }

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

// The export is a local download only. It intentionally contains connection
// tokens so users can move a complete profile set between browsers/devices.
const PROFILE_BUNDLE_FORMAT = "xmrig-proxy-dashboard-profile-bundle";
const PROFILE_BUNDLE_VERSION = 1;
const MAX_PROFILE_BUNDLE_BYTES = 1024 * 1024;

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}
const MAX_IMPORTED_PROFILES = 100;

class ProfileBundleValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProfileBundleValidationError";
  }
}

function validateImportedProfiles(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IMPORTED_PROFILES) {
    throw new ProfileBundleValidationError("导入文件必须包含 1 到 100 个 Proxy 配置");
  }

  const seen = new Set();
  return value.map((profile, index) => {
    const number = index + 1;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new ProfileBundleValidationError("第 " + number + " 个配置格式无效");
    }

    const id = profile.id;
    const name = profile.name;
    const apiUrl = profile.apiUrl;
    const apiToken = profile.apiToken;
    const remember = profile.remember;
    const refreshInterval = profile.refreshInterval;

    if (typeof id !== "string" || id !== id.trim() || !id
        || id.length > 128 || /[\u0000-\u001F\u007F]/.test(id)) {
      throw new ProfileBundleValidationError("第 " + number + " 个配置的 ID 无效");
    }
    if (seen.has(id)) throw new ProfileBundleValidationError("导入文件包含重复的配置 ID");
    seen.add(id);

    if (typeof name !== "string" || !name.trim() || name.trim().length > 128
        || /[\u0000-\u001F\u007F]/.test(name)) {
      throw new ProfileBundleValidationError("第 " + number + " 个配置的名称无效");
    }
    if (typeof apiUrl !== "string" || apiUrl.length > 2048 || !isValidApiUrl(apiUrl)) {
      throw new ProfileBundleValidationError("第 " + number + " 个配置的 API URL 无效");
    }
    if (typeof apiToken !== "string" || apiToken.length > 4096
        || /[\u0000-\u001F\u007F]/.test(apiToken)) {
      throw new ProfileBundleValidationError("第 " + number + " 个配置的 Token 无效或过长");
    }
    if (typeof remember !== "boolean") {
      throw new ProfileBundleValidationError("第 " + number + " 个配置的“记住我”选项无效");
    }
    if (!Number.isInteger(refreshInterval) || refreshInterval < 1 || refreshInterval > 120) {
      throw new ProfileBundleValidationError("第 " + number + " 个配置的刷新间隔必须是 1 到 120 秒的整数");
    }

    const normalized = normalizeProfile({ id, name: name.trim(), apiUrl, apiToken, remember, refreshInterval });
    if (!normalized) throw new ProfileBundleValidationError("第 " + number + " 个配置无法验证");
    return normalized;
  });
}

function readProfileTokensForExport() {
  const entry = readStorageEntry("session", PROFILE_TOKENS_KEY);
  if (!entry.ok) {
    throw new Error("无法读取会话 Token，不能生成包含敏感信息的完整备份。请选择“不含 Token”导出，或允许浏览器访问会话存储后重试");
  }
  if (!entry.value) return Object.create(null);

  let parsed;
  try {
    parsed = JSON.parse(entry.value);
  } catch {
    throw new Error("会话 Token 存储已损坏，不能生成包含敏感信息的完整备份");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("会话 Token 存储格式无效，不能生成包含敏感信息的完整备份");
  }

  const tokens = Object.create(null);
  for (const [id, token] of Object.entries(parsed)) {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
      throw new Error("会话 Token 存储包含无效数据，不能生成包含敏感信息的完整备份");
    }
    tokens[id] = token;
  }
  return tokens;
}

/**
 * Build an export payload.
 * @param {{includeSensitiveData?: boolean}} [options]
 *   When false, every Token is deliberately removed from the bundle.
 *   When true, session-only Token storage must be readable so a partial
 *   backup can never be mistaken for a complete one.
 */
export function createProfilesExport({ includeSensitiveData = true } = {}) {
  const profiles = loadProfiles();
  if (!profiles.length) throw new Error("没有可导出的 Proxy 配置");
  if (profiles.length > MAX_IMPORTED_PROFILES) {
    throw new Error("配置数量超过 100 个，无法生成兼容的导出文件");
  }

  const sessionTokens = includeSensitiveData && profiles.some(profile => !profile.remember)
    ? readProfileTokensForExport()
    : null;
  const exportable = validateImportedProfiles(profiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    apiUrl: profile.apiUrl,
    apiToken: includeSensitiveData
      ? (profile.remember
        ? (typeof profile.apiToken === "string" ? profile.apiToken : "")
        : (Object.hasOwn(sessionTokens, profile.id) ? sessionTokens[profile.id] : ""))
      : "",
    remember: profile.remember === true,
    refreshInterval: profile.refreshInterval,
  })));
  const bundle = {
    format: PROFILE_BUNDLE_FORMAT,
    version: PROFILE_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    includesSensitiveData: includeSensitiveData,
    profiles: exportable,
  };
  // The UI writes pretty-printed JSON; measure that representation so every
  // generated file also fits the parser's limit when re-imported.
  if (utf8ByteLength(JSON.stringify(bundle, null, 2)) > MAX_PROFILE_BUNDLE_BYTES) {
    throw new Error("导出文件超过 1 MB 限制，请减少配置数量或 Token 长度后重试");
  }
  return bundle;
}

/** Parse and validate a bundle fully before any persistent state is changed. */
export function parseProfilesImportJson(raw) {
  if (
    typeof raw !== "string"
    || raw.length === 0
    || raw.length > MAX_PROFILE_BUNDLE_BYTES
    || utf8ByteLength(raw) > MAX_PROFILE_BUNDLE_BYTES
  ) {
    throw new ProfileBundleValidationError("导入文件为空或超过 1 MB 限制");
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new ProfileBundleValidationError("导入文件不是有效的 JSON");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || payload.format !== PROFILE_BUNDLE_FORMAT
      || payload.version !== PROFILE_BUNDLE_VERSION) {
    throw new ProfileBundleValidationError("导入文件格式或版本不受支持");
  }

  return {
    format: PROFILE_BUNDLE_FORMAT,
    version: PROFILE_BUNDLE_VERSION,
    profiles: validateImportedProfiles(payload.profiles),
  };
}

function snapshotImportKeys(includeSessionStorage) {
  const entries = [
    { kind: "local", key: PROFILES_KEY },
    { kind: "local", key: ACTIVE_PROFILE_KEY },
    { kind: "local", key: CONFIG_KEY },
  ];
  if (includeSessionStorage) {
    entries.push(
      { kind: "session", key: PROFILE_TOKENS_KEY },
      { kind: "session", key: CONFIG_KEY },
    );
  }
  return entries.map(entry => {
    const current = readStorageEntry(entry.kind, entry.key);
    if (!current.ok) throw new Error("无法读取浏览器存储快照");
    return { ...entry, value: current.value };
  });
}

function restoreImportSnapshot(snapshot) {
  let restored = true;
  for (const entry of snapshot) {
    const current = readStorageEntry(entry.kind, entry.key);
    if (!current.ok) {
      restored = false;
      continue;
    }
    if (current.value === entry.value) continue;

    const written = entry.key === CONFIG_KEY
      ? restoreStoredConfigEntry(entry.kind, entry.value)
      : entry.value === null
        ? safeRemove(entry.kind, entry.key)
        : safeSet(entry.kind, entry.key, entry.value);
    if (!written) {
      restored = false;
      continue;
    }

    const verified = readStorageEntry(entry.kind, entry.key);
    if (!verified.ok || verified.value !== entry.value) restored = false;
  }
  if (!restored) storageRecoveryWarningPending = true;
  return restored;
}

/**
 * Merge a validated import by profile ID. Existing IDs are replaced, other
 * saved profiles remain untouched, and the current active profile is preserved.
 * A failed multi-key write rolls back the raw pre-import values where possible.
 */
export function importProfiles(importedProfiles, { allowActiveProfileFallback = false } = {}) {
  // Revalidate at the write boundary as this exported API may be called by
  // code paths other than parseProfilesImportJson(); never trust raw callers.
  const incoming = validateImportedProfiles(importedProfiles);
  let local;
  let session = null;
  let snapshot;
  const needsSessionStorage = incoming.some(profile => !profile.remember);

  try {
    local = globalThis.localStorage;
  } catch {
    throw new Error("浏览器存储不可用，无法安全导入配置");
  }
  try {
    const candidate = globalThis.sessionStorage;
    candidate.getItem(PROFILE_TOKENS_KEY);
    session = candidate;
  } catch {
    // Session storage is optional for persistent-only imports.
  }
  if (needsSessionStorage && !session) {
    throw new Error("浏览器会话存储不可用，无法导入未启用“记住我”的配置");
  }
  try {
    snapshot = snapshotImportKeys(Boolean(session));
  } catch {
    throw new Error("浏览器存储不可用，无法安全导入配置");
  }

  try {
    const existing = loadProfiles();
    const merged = existing.slice();
    let added = 0;
    let updated = 0;

    for (const profile of incoming) {
      const index = merged.findIndex(item => item.id === profile.id);
      if (index >= 0) {
        merged[index] = profile;
        updated++;
      } else {
        merged.push(profile);
        added++;
      }
    }

    if (merged.length > MAX_IMPORTED_PROFILES) {
      throw new ProfileBundleValidationError("导入后配置总数不能超过 100 个");
    }

    let sessionTokenCleanupSkipped = false;
    if (!session) {
      const existingSessionOnlyIds = new Set(
        existing.filter(profile => !profile.remember).map(profile => profile.id),
      );
      sessionTokenCleanupSkipped = incoming.some(
        profile => profile.remember && existingSessionOnlyIds.has(profile.id),
      );
      // The persistent profile record contains its own credential and takes
      // precedence over session tokens. Continue the import, but report that
      // an inaccessible stale session token could not be removed.
    }

    const activeEntry = readStorageEntry("local", ACTIVE_PROFILE_KEY);
    if (!activeEntry.ok) throw new Error("无法读取当前活动配置");
    const previousActiveId = activeEntry.value;
    const activeStillExists = merged.some(profile => profile.id === previousActiveId);
    const activeProfileFallback = previousActiveId !== null && !activeStillExists;
    if (activeProfileFallback && !allowActiveProfileFallback) {
      const error = new Error("导入需要切换到第一个可用配置，请明确确认后重试");
      error.code = "ACTIVE_PROFILE_FALLBACK_CONSENT_REQUIRED";
      throw error;
    }

    if (session) {
      const previousTokens = readProfileTokens();
      const tokens = Object.assign(Object.create(null), previousTokens);
      for (const profile of incoming) {
        if (profile.remember) delete tokens[profile.id];
        else tokens[profile.id] = profile.apiToken;
      }
      // Do not write when no token keys change. If cleanup or persistence is
      // required but the session store is unwritable, abort and roll back instead
      // of silently leaving a stale credential behind.
      if (JSON.stringify(tokens) !== JSON.stringify(previousTokens) && !writeProfileTokens(tokens)) {
        throw new Error("无法更新会话 Token 存储");
      }
    }
    if (!writeProfiles(merged)) {
      throw new Error("无法保存导入的 Proxy 配置");
    }

    if (!activeStillExists && merged.length) {
      // Repair a stale active ID deterministically so the dashboard always has
      // a valid active profile after importing into a fresh or manually edited store.
      if (!safeSet("local", ACTIVE_PROFILE_KEY, merged[0].id)) {
        throw new Error("无法保存活动配置 ID");
      }
    }

    return {
      added,
      updated,
      total: merged.length,
      ...(activeProfileFallback ? { activeProfileFallback: true } : {}),
      ...(sessionTokenCleanupSkipped ? { sessionTokenCleanupSkipped: true } : {}),
    };
  } catch (error) {
    const restored = snapshot ? restoreImportSnapshot(snapshot) : true;
    if (!restored) {
      throw new Error("导入失败，且浏览器存储未能完整恢复原状态。请清理此站点的浏览数据后检查配置");
    }
    if (error instanceof ProfileBundleValidationError
        || error?.code === "ACTIVE_PROFILE_FALLBACK_CONSENT_REQUIRED") throw error;
    throw new Error("导入失败，现有配置已尽力恢复。请检查浏览器存储空间后重试");
  }
}
