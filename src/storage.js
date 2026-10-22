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
  const serialized = JSON.stringify(cfg);
  if (cfg.remember) {
    // localStorage is authoritative in remember mode. A blocked session store
    // must not prevent a persistent save; any stale session entry is ignored.
    if (!safeSet("local", CONFIG_KEY, serialized)) return false;
    safeRemove("session", CONFIG_KEY);
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
  if (!isValidApiUrl(profile.apiUrl)) return null;
  const id = typeof profile.id === "string" && profile.id.trim() ? profile.id.trim() : null;
  if (!id) return null;
  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : "Proxy";
  const refreshInterval = Math.min(120, Math.max(1, Number(profile.refreshInterval) || 10));
  return {
    id,
    name,
    apiUrl: profile.apiUrl,
    apiToken: profile.apiToken ?? "",
    remember: profile.remember ?? true,
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
    return Object.assign(Object.create(null), parsed);
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

/** Save or update one Proxy profile and make it active. */
export function saveProfile(profile) {
  const normalized = normalizeProfile({
    ...profile,
    id: profile.id || `proxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  if (!normalized) return null;

  const profiles = loadProfiles();
  const index = profiles.findIndex(item => item.id === normalized.id);
  if (index >= 0) profiles[index] = normalized;
  else profiles.push(normalized);

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
  if (!writeProfiles(profiles)
      || !safeSet("local", ACTIVE_PROFILE_KEY, normalized.id)
      || !saveConfig(normalized)) return null;
  return normalized;
}

/** Remove a saved Proxy profile. The last profile cannot be removed. */
export function deleteProfile(id) {
  const profiles = loadProfiles();
  if (profiles.length <= 1) return false;
  const removed = profiles.find(profile => profile.id === id);
  if (!removed) return false;
  const next = profiles.filter(profile => profile.id !== id);
  const tokens = readProfileTokens();
  const hadSessionToken = Object.hasOwn(tokens, id);
  delete tokens[id];

  // Only require a token-map write when there was a token to remove. This
  // avoids making deletion of unrelated remembered profiles depend on
  // sessionStorage, while still reporting failed cleanup of an actual token.
  if (hadSessionToken && !writeProfileTokens(tokens)) return false;
  if (!writeProfiles(next)) return false;
  if (safeGet("local", ACTIVE_PROFILE_KEY) === id) {
    if (!safeSet("local", ACTIVE_PROFILE_KEY, next[0].id) || !saveConfig(next[0])) return false;
  }
  return true;
}

/** Select a saved Proxy profile and make its connection config active. */
export function setActiveProfile(id) {
  const profile = loadProfiles().find(item => item.id === id);
  if (!profile) return null;
  if (!safeSet("local", ACTIVE_PROFILE_KEY, profile.id) || !saveConfig(profile)) return null;
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
  if (!isValidApiUrl(config.apiUrl)) return null;
  const refreshInterval = config.refreshInterval ?? 10;
  return {
    apiUrl:          config.apiUrl,
    apiToken:        config.apiToken        ?? "",
    remember:        config.remember        ?? true,
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
      if (hydrated) return hydrated;
    } catch {
      // JSON parse failure — fall through to sessionStorage.
    }
    safeRemove("local", CONFIG_KEY);
  }
  raw = safeGet("session", CONFIG_KEY);
  if (raw) {
    try {
      const hydrated = hydrateConnection(raw);
      if (hydrated) return hydrated;
    } catch {
      // JSON parse failure — return null below.
    }
    safeRemove("session", CONFIG_KEY);
  }
  return null;
}

/** Clear connection config from both storages (logout). Does NOT touch theme. */
export function clearConfig() {
  // Attempt every removal even if one store is blocked. Report partial cleanup
  // so callers never claim credentials were definitely cleared when they were not.
  const results = [
    safeRemove("local", CONFIG_KEY),
    safeRemove("session", CONFIG_KEY),
    safeRemove("session", PROFILE_TOKENS_KEY),
    safeRemove("local", ACTIVE_PROFILE_KEY),
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
