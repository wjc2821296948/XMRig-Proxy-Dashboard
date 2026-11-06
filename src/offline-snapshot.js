/**
 * Bounded, profile-scoped cache for the last successful Proxy summary.
 *
 * Only fields rendered by the dashboard are persisted. Proxy URLs, tokens,
 * headers, and arbitrary upstream response fields are never copied.
 */
const STORAGE_KEY = "dashboard_offline_snapshot_v1";
const MAX_CACHE_CHARS = 64 * 1024;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PROFILE_ID_LENGTH = 256;

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeText(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength)
    : "";
}

function numericArray(value, length) {
  return Array.isArray(value) ? value.slice(0, length).map(numberOrZero) : [];
}

/** Return a small allowlisted summary shape suitable for local offline display. */
export function sanitizeOfflineSummary(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const miners = objectOrEmpty(data.miners);
  if (!data.miners || typeof data.miners !== "object" || Array.isArray(data.miners)) return null;

  const resources = objectOrEmpty(data.resources);
  const memory = objectOrEmpty(resources.memory);
  const upstreams = objectOrEmpty(data.upstreams);
  const results = objectOrEmpty(data.results);
  const hashrate = objectOrEmpty(data.hashrate);

  return {
    worker_id: safeText(data.worker_id, 128),
    version: safeText(data.version, 64),
    hashrate: { total: numericArray(hashrate.total, 6) },
    miners: {
      now: numberOrZero(miners.now),
      max: numberOrZero(miners.max),
    },
    workers: numberOrZero(data.workers),
    uptime: numberOrZero(data.uptime),
    resources: {
      memory: {
        total: numberOrZero(memory.total),
        free: numberOrZero(memory.free),
        resident_set_memory: numberOrZero(memory.resident_set_memory),
      },
      load_average: numericArray(resources.load_average, 3),
      hardware_concurrency: numberOrZero(resources.hardware_concurrency),
    },
    upstreams: {
      active: numberOrZero(upstreams.active),
      sleep: numberOrZero(upstreams.sleep),
      error: numberOrZero(upstreams.error),
      total: numberOrZero(upstreams.total),
      ratio: numberOrZero(upstreams.ratio),
    },
    results: {
      accepted: numberOrZero(results.accepted),
      rejected: numberOrZero(results.rejected),
      invalid: numberOrZero(results.invalid),
      expired: numberOrZero(results.expired),
      latency: numberOrZero(results.latency),
      hashes_total: numberOrZero(results.hashes_total),
      avg_time: numberOrZero(results.avg_time),
    },
  };
}

/**
 * Persist one profile's last summary. The newest active profile replaces the
 * previous snapshot; this keeps storage bounded and avoids cross-profile use.
 */
export function saveOfflineSnapshot(profileId, data, savedAt = Date.now()) {
  if (
    typeof profileId !== "string" ||
    !profileId.trim() ||
    profileId.length > MAX_PROFILE_ID_LENGTH ||
    typeof savedAt !== "number" ||
    !Number.isFinite(savedAt) ||
    savedAt < 0
  ) return false;

  const summary = sanitizeOfflineSummary(data);
  if (!summary) return false;

  try {
    const serialized = JSON.stringify({
      version: 1,
      profileId,
      savedAt,
      data: summary,
    });
    if (serialized.length > MAX_CACHE_CHARS) return false;
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

/** Load a recent snapshot only for the currently active Proxy profile. */
export function loadOfflineSnapshot(profileId, now = Date.now()) {
  if (
    typeof profileId !== "string" ||
    !profileId.trim() ||
    profileId.length > MAX_PROFILE_ID_LENGTH ||
    typeof now !== "number" ||
    !Number.isFinite(now) ||
    now < 0
  ) return null;

  try {
    const storage = globalThis.localStorage;
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_CACHE_CHARS) return null;

    const cached = JSON.parse(raw);
    if (
      cached?.version !== 1 ||
      cached.profileId !== profileId ||
      typeof cached.savedAt !== "number" ||
      !Number.isFinite(cached.savedAt) ||
      cached.savedAt > now + 5 * 60 * 1000 ||
      now - cached.savedAt >= MAX_CACHE_AGE_MS
    ) return null;

    const data = sanitizeOfflineSummary(cached.data);
    return data ? { data, savedAt: cached.savedAt } : null;
  } catch {
    return null;
  }
}

/** Remove the cached metrics without touching saved Proxy credentials. */
export function clearOfflineSnapshot() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
