/**
 * Bounded, in-memory metrics history for the current dashboard session.
 * Only numeric samples are kept; credentials, Proxy URLs, and API payloads
 * are deliberately never persisted.
 */
export const MAX_HISTORY_SAMPLES = 30;

let samples = [];
let activeScope = null;

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function recordMetricSample(data, timestamp = Date.now(), scope = "default") {
  const nextScope = typeof scope === "string" && scope.length > 0 ? scope : "default";
  if (activeScope !== nextScope) {
    samples = [];
    activeScope = nextScope;
  }

  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < 0) {
    return getMetricHistory();
  }

  const rawHashrate = Array.isArray(data?.hashrate?.total) ? data.hashrate.total[0] : null;
  const hashrate = finiteNonNegative(rawHashrate);
  if (hashrate === null) return getMetricHistory();

  const last = samples[samples.length - 1];
  // An older response must not roll the chart backward.
  if (last && timestamp < last.timestamp) {
    console.debug("Ignoring out-of-order metric sample.", {
      timestamp,
      lastTimestamp: last.timestamp,
    });
    return getMetricHistory();
  }

  const sample = {
    timestamp,
    hashrate,
    miners: finiteNonNegative(data?.miners?.now),
    workers: finiteNonNegative(data?.workers),
  };

  if (last && timestamp === last.timestamp) {
    samples[samples.length - 1] = sample;
  } else {
    samples.push(sample);
  }

  if (samples.length > MAX_HISTORY_SAMPLES) {
    samples = samples.slice(-MAX_HISTORY_SAMPLES);
  }
  return getMetricHistory();
}

export function getMetricHistory() {
  return samples.map(sample => ({ ...sample }));
}

export function clearMetricHistory() {
  samples = [];
  activeScope = null;
}
