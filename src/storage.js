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

/** Consume the warning raised when a corrupt config cannot be cleared. */
export function consumeConfigCleanupWarning() {
  const pending = configCleanupWarningPending;
  configCleanupWarningPending = false;
  return pending;
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
  const target  = cfg.remember ? localStorage : sessionStorage;
  const sibling = cfg.remember ? sessionStorage : localStorage;
  sibling.removeItem(CONFIG_KEY);
  target.setItem(CONFIG_KEY, JSON.stringify(cfg));
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
    // Persist only well-typed credentials and fail closed when a malformed
    // remember flag is supplied, so a string like "false" cannot opt into
    // persistent token storage by being truthy.
    apiToken: typeof profile.apiToken === "string" ? profile.apiToken : "",
    // A missing flag is a legacy record; a present non-boolean value is malformed.
    remember: Object.hasOwn(profile, "remember") ? profile.remember === true : true,
    refreshInterval,
  };
}

function readProfileTokens() {
  const raw = sessionStorage.getItem(PROFILE_TOKENS_KEY);
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
  sessionStorage.setItem(PROFILE_TOKENS_KEY, JSON.stringify(tokens));
}

function readProfiles() {
  const raw = localStorage.getItem(PROFILES_KEY);
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
  localStorage.setItem(PROFILES_KEY, JSON.stringify(persistent));
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
  localStorage.setItem(ACTIVE_PROFILE_KEY, migrated[0].id);
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
    delete tokens[normalized.id];
  } else {
    tokens[normalized.id] = normalized.apiToken;
  }
  writeProfileTokens(tokens);
  writeProfiles(profiles);
  localStorage.setItem(ACTIVE_PROFILE_KEY, normalized.id);
  saveConfig(normalized);
  return normalized;
}

/** Remove a saved Proxy profile. The last profile cannot be removed. */
export function deleteProfile(id) {
  const profiles = loadProfiles();
  if (profiles.length <= 1) return false;
  const next = profiles.filter(profile => profile.id !== id);
  if (next.length === profiles.length) return false;
  const tokens = readProfileTokens();
  delete tokens[id];
  writeProfileTokens(tokens);
  writeProfiles(next);
  if (localStorage.getItem(ACTIVE_PROFILE_KEY) === id) {
    localStorage.setItem(ACTIVE_PROFILE_KEY, next[0].id);
    saveConfig(next[0]);
  }
  return true;
}

/** Select a saved Proxy profile and make its connection config active. */
export function setActiveProfile(id) {
  const profile = loadProfiles().find(item => item.id === id);
  if (!profile) return null;
  localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  saveConfig(profile);
  return profile;
}

/** @returns {string|null} */
export function loadActiveProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
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
  let raw = localStorage.getItem(CONFIG_KEY);
  if (raw) {
    try {
      const hydrated = hydrateConnection(raw);
      if (hydrated) return hydrated;
    } catch {
      // JSON parse failure — fall through to sessionStorage.
    }
    localStorage.removeItem(CONFIG_KEY);
  }
  raw = sessionStorage.getItem(CONFIG_KEY);
  if (raw) {
    try {
      const hydrated = hydrateConnection(raw);
      if (hydrated) return hydrated;
    } catch {
      // JSON parse failure — return null below.
    }
    sessionStorage.removeItem(CONFIG_KEY);
  }
  return null;
}

/** Clear connection config from both storages (logout). Does NOT touch theme. */
export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  sessionStorage.removeItem(CONFIG_KEY);
  sessionStorage.removeItem(PROFILE_TOKENS_KEY);
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

/* --------------------------------------------------------------------------
   UI preferences (theme)
   -------------------------------------------------------------------------- */

const VALID_THEMES = new Set(["dark", "light", "system"]);

/**
 * @param {"dark" | "light" | "system"} theme
 */
export function saveTheme(theme) {
  if (!VALID_THEMES.has(theme)) return;
  localStorage.setItem(THEME_KEY, theme);
}

/**
 * @returns {"dark" | "light" | "system"}
 */
export function loadTheme() {
  const raw = localStorage.getItem(THEME_KEY);
  return VALID_THEMES.has(raw) ? raw : "dark";
}

/** Clear the persisted theme preference. */
export function clearTheme() {
  localStorage.removeItem(THEME_KEY);
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
  if (!target) return;
  const map = readWriteAccessMap();
  map[target] = Boolean(enabled);
  writeWriteAccessMap(map);
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
    localStorage.removeItem(WRITE_KEY);
    return;
  }
  const map = readWriteAccessMap();
  if (target in map) {
    delete map[target];
    writeWriteAccessMap(map);
  }
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
  const raw = localStorage.getItem(WRITE_KEY);
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
  localStorage.setItem(WRITE_KEY, JSON.stringify(map));
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
const MAX_PROFILE_BUNDLE_CHARS = 1024 * 1024;
const MAX_IMPORTED_PROFILES = 100;
const IMPORT_FORBIDDEN_IDS = new Set(Object.getOwnPropertyNames(Object.prototype));

function validateImportedProfiles(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IMPORTED_PROFILES) {
    throw new Error("导入文件必须包含 1 到 100 个 Proxy 配置");
  }

  const seen = new Set();
  return value.map((profile, index) => {
    const number = index + 1;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new Error("第 " + number + " 个配置格式无效");
    }

    const id = profile.id;
    const name = profile.name;
    const apiUrl = profile.apiUrl;
    const apiToken = profile.apiToken;
    const remember = profile.remember;
    const refreshInterval = profile.refreshInterval;

    if (typeof id !== "string" || id !== id.trim()
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)
        || IMPORT_FORBIDDEN_IDS.has(id)) {
      throw new Error("第 " + number + " 个配置的 ID 无效");
    }
    if (seen.has(id)) throw new Error("导入文件包含重复的配置 ID");
    seen.add(id);

    if (typeof name !== "string" || !name.trim() || name.trim().length > 128
        || /[\u0000-\u001F\u007F]/.test(name)) {
      throw new Error("第 " + number + " 个配置的名称无效");
    }
    if (typeof apiUrl !== "string" || apiUrl.length > 2048 || !isValidApiUrl(apiUrl)) {
      throw new Error("第 " + number + " 个配置的 API URL 无效");
    }
    if (typeof apiToken !== "string" || apiToken.length > 4096
        || /[\u0000-\u001F\u007F]/.test(apiToken)) {
      throw new Error("第 " + number + " 个配置的 Token 无效或过长");
    }
    if (typeof remember !== "boolean") {
      throw new Error("第 " + number + " 个配置的“记住我”选项无效");
    }
    if (!Number.isInteger(refreshInterval) || refreshInterval < 1 || refreshInterval > 120) {
      throw new Error("第 " + number + " 个配置的刷新间隔必须是 1 到 120 秒的整数");
    }

    const normalized = normalizeProfile({ id, name: name.trim(), apiUrl, apiToken, remember, refreshInterval });
    if (!normalized) throw new Error("第 " + number + " 个配置无法验证");
    return normalized;
  });
}

/** Build an export payload; the UI confirms token export before downloading it. */
export function createProfilesExport() {
  const profiles = loadProfiles();
  if (!profiles.length) throw new Error("没有可导出的 Proxy 配置");
  if (profiles.length > MAX_IMPORTED_PROFILES) {
    throw new Error("配置数量超过 100 个，无法生成兼容的导出文件");
  }

  const exportable = validateImportedProfiles(profiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    apiUrl: profile.apiUrl,
    apiToken: typeof profile.apiToken === "string" ? profile.apiToken : "",
    remember: profile.remember === true,
    refreshInterval: profile.refreshInterval,
  })));
  const bundle = {
    format: PROFILE_BUNDLE_FORMAT,
    version: PROFILE_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    profiles: exportable,
  };
  if (JSON.stringify(bundle).length > MAX_PROFILE_BUNDLE_CHARS) {
    throw new Error("导出文件超过 1 MB 限制，请减少配置数量或 Token 长度后重试");
  }
  return bundle;
}

/** Parse and validate a bundle fully before any persistent state is changed. */
export function parseProfilesImportJson(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PROFILE_BUNDLE_CHARS) {
    throw new Error("导入文件为空或超过 1 MB 限制");
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("导入文件不是有效的 JSON");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || payload.format !== PROFILE_BUNDLE_FORMAT
      || payload.version !== PROFILE_BUNDLE_VERSION) {
    throw new Error("导入文件格式或版本不受支持");
  }

  return {
    format: PROFILE_BUNDLE_FORMAT,
    version: PROFILE_BUNDLE_VERSION,
    profiles: validateImportedProfiles(payload.profiles),
  };
}

function snapshotImportKeys(local, session) {
  const entries = [
    { storage: local, key: PROFILES_KEY },
    { storage: local, key: ACTIVE_PROFILE_KEY },
    { storage: local, key: CONFIG_KEY },
    { storage: session, key: PROFILE_TOKENS_KEY },
    { storage: session, key: CONFIG_KEY },
  ];
  return entries.map(entry => ({ ...entry, value: entry.storage.getItem(entry.key) }));
}

function restoreImportSnapshot(snapshot) {
  let restored = true;
  for (const entry of snapshot) {
    try {
      const current = entry.storage.getItem(entry.key);
      if (current === entry.value) continue;
      if (entry.value === null) entry.storage.removeItem(entry.key);
      else entry.storage.setItem(entry.key, entry.value);
      if (entry.storage.getItem(entry.key) !== entry.value) restored = false;
    } catch {
      restored = false;
    }
  }
  return restored;
}

/**
 * Merge a validated import by profile ID. Existing IDs are replaced, other
 * saved profiles remain untouched, and the current active profile is preserved.
 * A failed multi-key write rolls back the raw pre-import values where possible.
 */
export function importProfiles(importedProfiles) {
  const incoming = validateImportedProfiles(importedProfiles);
  let local;
  let session;
  let snapshot;

  try {
    local = globalThis.localStorage;
    session = globalThis.sessionStorage;
    snapshot = snapshotImportKeys(local, session);
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
      throw new Error("导入后配置总数不能超过 100 个");
    }

    const tokens = Object.assign(Object.create(null), readProfileTokens());
    for (const profile of incoming) {
      if (profile.remember) delete tokens[profile.id];
      else tokens[profile.id] = profile.apiToken;
    }

    writeProfileTokens(tokens);
    writeProfiles(merged);

    const previousActiveId = local.getItem(ACTIVE_PROFILE_KEY);
    const activeStillExists = merged.some(profile => profile.id === previousActiveId);
    if (!activeStillExists && merged.length) {
      local.setItem(ACTIVE_PROFILE_KEY, merged[0].id);
    }

    return { added, updated, total: merged.length };
  } catch (error) {
    const restored = snapshot ? restoreImportSnapshot(snapshot) : true;
    if (!restored) {
      throw new Error("导入失败，且浏览器存储未能完整恢复原状态。请清理此站点的浏览数据后检查配置");
    }
    if (error instanceof Error && /^(导入后配置总数|导入文件)/.test(error.message)) throw error;
    throw new Error("导入失败，现有配置已尽力恢复。请检查浏览器存储空间后重试");
  }
}
