/**
 * Local alert evaluation primitives.
 *
 * These functions are deliberately side-effect-free: they never request
 * browser-notification permission, touch storage, or log the input payload.
 */
export const DEFAULT_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ALERT_IDS = new Set(["low-hashrate", "low-miners", "high-rejection-rate"]);

function nonNegativeFinite(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function optionalThreshold(value) {
  if (value === null || value === undefined || value === "") return null;
  return nonNegativeFinite(value);
}

export function normalizeAlertConfig(input = {}) {
  const config = input && typeof input === "object" ? input : {};
  const minimumHashrateKhS = optionalThreshold(config.minimumHashrateKhS);
  const minimumMinersRaw = optionalThreshold(config.minimumMiners);
  const maximumRejectedSharePercentRaw = optionalThreshold(config.maximumRejectedSharePercent);
  const cooldownRaw = nonNegativeFinite(config.cooldownMs);

  return {
    // null disables a rule; do not invent operator-specific mining thresholds.
    minimumHashrateKhS,
    minimumMiners: minimumMinersRaw !== null && Number.isInteger(minimumMinersRaw)
      ? minimumMinersRaw
      : null,
    maximumRejectedSharePercent: maximumRejectedSharePercentRaw !== null
      && maximumRejectedSharePercentRaw <= 100
      ? maximumRejectedSharePercentRaw
      : null,
    cooldownMs: cooldownRaw !== null && cooldownRaw <= MAX_ALERT_COOLDOWN_MS
      ? Math.floor(cooldownRaw)
      : DEFAULT_ALERT_COOLDOWN_MS,
  };
}

export function evaluateAlertConditions(data, inputConfig = {}) {
  const config = normalizeAlertConfig(inputConfig);
  const alerts = [];
  const hashrate = Array.isArray(data?.hashrate?.total)
    ? nonNegativeFinite(data.hashrate.total[0])
    : null;

  if (config.minimumHashrateKhS !== null
      && hashrate !== null
      && hashrate < config.minimumHashrateKhS) {
    alerts.push({
      id: "low-hashrate",
      severity: "warning",
      metric: "hashrate",
      value: hashrate,
      threshold: config.minimumHashrateKhS,
      message: "Hashrate is below the configured threshold.",
    });
  }

  const miners = nonNegativeFinite(data?.miners?.now);
  if (config.minimumMiners !== null && miners !== null && miners < config.minimumMiners) {
    alerts.push({
      id: "low-miners",
      severity: "warning",
      metric: "miners",
      value: miners,
      threshold: config.minimumMiners,
      message: "Active miner count is below the configured threshold.",
    });
  }

  const accepted = nonNegativeFinite(data?.results?.accepted);
  const rejected = nonNegativeFinite(data?.results?.rejected);
  if (config.maximumRejectedSharePercent !== null
      && accepted !== null
      && rejected !== null
      && accepted + rejected > 0) {
    const rejectedSharePercent = rejected / (accepted + rejected) * 100;
    if (rejectedSharePercent > config.maximumRejectedSharePercent) {
      alerts.push({
        id: "high-rejection-rate",
        severity: "warning",
        metric: "rejectedSharePercent",
        value: rejectedSharePercent,
        threshold: config.maximumRejectedSharePercent,
        message: "Rejected-share ratio is above the configured threshold.",
      });
    }
  }

  return alerts;
}

/**
 * Return transition-only notifications and an immutable state snapshot.
 * An alert that remains active is not emitted on every refresh. A recovered
 * alert may re-fire only after its cooldown has elapsed.
 */
export function transitionAlertState(data, inputConfig = {}, previousState = {}, now = Date.now()) {
  const config = normalizeAlertConfig(inputConfig);
  const timestamp = nonNegativeFinite(now) ?? Date.now();
  const currentAlerts = evaluateAlertConditions(data, config);
  const activeIds = currentAlerts.map(alert => alert.id);
  const activeSet = new Set(activeIds);
  const previousActive = new Set(
    Array.isArray(previousState?.activeIds)
      ? previousState.activeIds.filter(id => ALERT_IDS.has(id))
      : [],
  );

  const lastNotifiedAt = {};
  const previousTimes = previousState?.lastNotifiedAt;
  if (previousTimes && typeof previousTimes === "object") {
    for (const id of ALERT_IDS) {
      const previousTime = nonNegativeFinite(previousTimes[id]);
      if (previousTime !== null) lastNotifiedAt[id] = previousTime;
    }
  }

  const notifications = currentAlerts.filter(alert => {
    if (previousActive.has(alert.id)) return false;
    const previousTime = lastNotifiedAt[alert.id];
    return previousTime === undefined || timestamp - previousTime >= config.cooldownMs;
  });

  for (const alert of notifications) lastNotifiedAt[alert.id] = timestamp;

  const recoveredIds = [...previousActive].filter(id => !activeSet.has(id));
  return {
    activeIds,
    notifications,
    recoveredIds,
    nextState: { activeIds: [...activeIds], lastNotifiedAt },
  };
}
