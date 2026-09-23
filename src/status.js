/**
 * status.js – Production-oriented miner status state machine.
 *
 * The XMRig Proxy /1/summary API exposes:
 *   - data.miners.now / max
 *   - data.results.accepted / rejected (cumulative counters)
 *   - data.uptime (seconds since the current Proxy process started)
 *
 * This module intentionally keeps temporal state outside the renderer so a
 * single transient API sample cannot immediately flip the dashboard badge.
 */

const DEFAULTS = Object.freeze({
  // Ignore the sticky lifetime max when deciding current health.
  peakWindowMs: 15 * 60 * 1000,

  // A zero-miner sample must persist for this long before becoming offline.
  zeroGraceMs: 20 * 1000,

  // Keep the explicit "restarting" state visible after an uptime reset.
  restartGraceMs: 30 * 1000,

  // A recovered Proxy needs two consecutive positive samples before
  // returning to the normal business state.
  recoverySamples: 2,

  // Current miners below half of the recent peak => warning.
  warningRatio: 0.5,

  // Do not judge acceptance health from tiny samples.
  minHealthShares: 20,

  // Health is evaluated from the most recent consecutive successful samples.
  // Reject stale pairs that are farther apart than the recent-peak window.
  healthWindowMs: 15 * 60 * 1000,

  // A brand-new Proxy with no historical miners is shown as "waiting"
  // only during the first minute of its current process lifetime.
  coldStartWindowMs: 60 * 1000,
});

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function status(cls, text) {
  return { cls, text };
}

export function createStatusTracker(options = {}) {
  return {
    cfg: { ...DEFAULTS, ...options },

    previousUptime: null,
    restartUntil: 0,

    zeroSince: null,
    recoveryCount: 0,

    // True once at least one positive miner sample has been observed in this
    // Proxy process lifetime.
    everHadMiners: false,

    // Recent /1/summary snapshots used for peak and acceptance-rate logic.
    samples: [],

    // Last stable business state. A short zero sample can keep this state
    // instead of flashing to red immediately.
    lastStableStatus: null,
  };
}

export function resetStatusTracker(tracker) {
  tracker.previousUptime = null;
  tracker.restartUntil = 0;
  tracker.zeroSince = null;
  tracker.recoveryCount = 0;
  tracker.everHadMiners = false;
  tracker.samples = [];
  tracker.lastStableStatus = null;
}

function trimSamples(tracker, nowMs) {
  const cutoff = nowMs - tracker.cfg.peakWindowMs;
  tracker.samples = tracker.samples.filter(sample => sample.ts >= cutoff);
}

function recordSample(tracker, data, nowMs) {
  const miners = data?.miners ?? {};
  const results = data?.results ?? {};

  const minerCount = asNumber(miners.now);
  const accepted = asNumber(results.accepted);
  const rejected = asNumber(results.rejected);

  if (minerCount > 0) {
    tracker.everHadMiners = true;
  }

  tracker.samples.push({
    ts: nowMs,
    miners: minerCount,
    accepted,
    rejected,
  });

  trimSamples(tracker, nowMs);

  return { minerCount, accepted, rejected };
}

function detectRestart(tracker, uptime, nowMs, minerCount) {
  if (
    tracker.previousUptime !== null &&
    Number.isFinite(uptime) &&
    uptime < tracker.previousUptime
  ) {
    // Only keep the explicit restart state while the first post-restart
    // sample still has zero miners. With a long refresh interval the first
    // observed sample may already be recovered, in which case showing
    // "restarting" would be misleading.
    tracker.restartUntil = minerCount === 0
      ? nowMs + tracker.cfg.restartGraceMs
      : 0;

    // The old process lifetime must not contaminate the new one's peak or
    // share-counter baseline.
    tracker.samples = [];
    tracker.zeroSince = minerCount === 0 ? nowMs : null;
    tracker.recoveryCount = 0;
    tracker.everHadMiners = false;
    tracker.lastStableStatus = null;
  }

  if (Number.isFinite(uptime)) {
    tracker.previousUptime = uptime;
  }
}

function getRecentPeak(tracker) {
  if (tracker.samples.length === 0) {
    return 0;
  }

  return Math.max(...tracker.samples.map(sample => sample.miners));
}

function getRecentAcceptanceRate(tracker) {
  if (tracker.samples.length < 2) {
    return null;
  }

  // Compare the two most recent successful samples. This works with every
  // supported refresh interval, including low-frequency polling such as
  // 120 seconds, while still rejecting stale gaps beyond the health window.
  const first = tracker.samples[tracker.samples.length - 2];
  const last = tracker.samples[tracker.samples.length - 1];

  if (last.ts - first.ts > tracker.cfg.healthWindowMs) {
    return null;
  }

  const acceptedDelta = last.accepted - first.accepted;
  const rejectedDelta = last.rejected - first.rejected;

  // A counter reset is not enough evidence to call the Proxy unhealthy.
  if (acceptedDelta < 0 || rejectedDelta < 0) {
    return null;
  }

  const total = acceptedDelta + rejectedDelta;

  if (total < tracker.cfg.minHealthShares) {
    return null;
  }

  return acceptedDelta / total;
}

/**
 * Compute the dashboard business state for one successful /1/summary
 * response.
 *
 * @param {object} data
 * @param {ReturnType<typeof createStatusTracker>} tracker
 * @param {number} nowMs
 * @returns {{cls:string,text:string}}
 */
export function getStatusInfo(data, tracker, nowMs = Date.now()) {
  if (!tracker) {
    throw new Error("status tracker is required");
  }

  if (!data || !data.miners) {
    return status("status-offline", "离线");
  }

  const minerCount = asNumber(data.miners.now);
  const historicalMax = asNumber(data.miners.max);
  const uptime = asNumber(data.uptime, NaN);

  detectRestart(tracker, uptime, nowMs, minerCount);

  // Restart state is tied to Proxy process lifetime, not to a hypothetical
  // timestamp field that does not exist in the miners object.
  if (nowMs < tracker.restartUntil) {
    return status("status-restarting", "重启中");
  }

  recordSample(tracker, data, nowMs);

  /*
   * Cold start:
   * max=0 + now=0 is only "waiting" while this Proxy process itself is
   * genuinely fresh. An old, empty Proxy should eventually be reported
   * as offline instead of waiting forever.
   */
  if (
    minerCount === 0 &&
    !tracker.everHadMiners &&
    historicalMax === 0 &&
    Number.isFinite(uptime) &&
    uptime < tracker.cfg.coldStartWindowMs / 1000
  ) {
    tracker.zeroSince ??= nowMs;
    return status("status-waiting", "等待中");
  }

  /*
   * Zero-miner debounce.
   */
  if (minerCount === 0) {
    tracker.zeroSince ??= nowMs;

    const zeroAge = nowMs - tracker.zeroSince;

    if (zeroAge < tracker.cfg.zeroGraceMs) {
      // Preserve the last known stable state through a short zero blip.
      if (tracker.lastStableStatus) {
        return tracker.lastStableStatus;
      }

      return status("status-waiting", "等待中");
    }

    tracker.recoveryCount = 0;

    const offline = status("status-offline", "离线");
    tracker.lastStableStatus = offline;
    return offline;
  }

  /*
   * At least one miner is back.
   */
  tracker.zeroSince = null;

  if (tracker.lastStableStatus?.cls === "status-offline") {
    tracker.recoveryCount++;

    if (tracker.recoveryCount < tracker.cfg.recoverySamples) {
      // First healthy sample after an outage is still transitional.
      return status("status-warning", "预警");
    }
  } else {
    tracker.recoveryCount = tracker.cfg.recoverySamples;
  }

  /*
   * Use a rolling recent peak, not XMRig Proxy's sticky lifetime max.
   */
  const recentPeak = getRecentPeak(tracker);
  const minerWarning =
    recentPeak >= 2 &&
    minerCount < recentPeak * tracker.cfg.warningRatio;

  /*
   * Health is a separate warning dimension. It uses deltas between the two
   * most recent successful samples so an old healthy history cannot hide a
   * current rejection spike.
   */
  const acceptanceRate = getRecentAcceptanceRate(tracker);
  const healthWarning =
    acceptanceRate !== null &&
    acceptanceRate < tracker.cfg.warningRatio;

  if (minerWarning || healthWarning) {
    const warning = status("status-warning", "预警");
    tracker.lastStableStatus = warning;
    tracker.recoveryCount = tracker.cfg.recoverySamples;
    return warning;
  }

  const online = status("status-online", "在线");
  tracker.lastStableStatus = online;
  tracker.recoveryCount = tracker.cfg.recoverySamples;
  return online;
}
