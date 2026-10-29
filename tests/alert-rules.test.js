import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ALERT_COOLDOWN_MS,
  evaluateAlertConditions,
  normalizeAlertConfig,
  transitionAlertState,
} from "../src/alert-rules.js";

const payload = ({ hashrate = 100, miners = 3, accepted = 100, rejected = 0 } = {}) => ({
  hashrate: { total: [hashrate] },
  miners: { now: miners },
  results: { accepted, rejected },
});

test("alert rules are disabled until an operator supplies thresholds", () => {
  assert.deepEqual(evaluateAlertConditions(payload()), []);
  assert.deepEqual(normalizeAlertConfig({}), {
    minimumHashrateKhS: null,
    minimumMiners: null,
    maximumRejectedSharePercent: null,
    cooldownMs: DEFAULT_ALERT_COOLDOWN_MS,
  });
});

test("threshold comparisons use explicit strict boundaries", () => {
  const config = { minimumHashrateKhS: 100, minimumMiners: 3 };
  assert.deepEqual(evaluateAlertConditions(payload({ hashrate: 100, miners: 3 }), config), []);
  assert.deepEqual(
    evaluateAlertConditions(payload({ hashrate: 99.9, miners: 2 }), config).map(a => a.id),
    ["low-hashrate", "low-miners"],
  );
});

test("rejected share ratio only fires when valid counters exceed the configured percentage", () => {
  const config = { maximumRejectedSharePercent: 10 };
  assert.deepEqual(evaluateAlertConditions(payload({ accepted: 9, rejected: 1 }), config), []);
  assert.deepEqual(
    evaluateAlertConditions(payload({ accepted: 8, rejected: 2 }), config).map(a => a.id),
    [],
  );
  assert.deepEqual(
    evaluateAlertConditions(payload({ accepted: 7, rejected: 3 }), config).map(a => a.id),
    ["high-rejection-rate"],
  );
  assert.deepEqual(evaluateAlertConditions(payload({ accepted: 0, rejected: 0 }), config), []);
});

test("missing, negative, and non-finite metrics do not produce false alerts", () => {
  const config = {
    minimumHashrateKhS: 50,
    minimumMiners: 2,
    maximumRejectedSharePercent: 5,
  };
  assert.deepEqual(evaluateAlertConditions(payload({ hashrate: Number.NaN, miners: -1 }), config), []);
  assert.deepEqual(evaluateAlertConditions({ hashrate: { total: [] }, results: {} }, config), []);
  assert.equal(normalizeAlertConfig({
    minimumHashrateKhS: -1,
    minimumMiners: 1.5,
    maximumRejectedSharePercent: 101,
    cooldownMs: Infinity,
  }).minimumHashrateKhS, null);
});

test("messages contain only generic status text and numeric thresholds", () => {
  const alerts = evaluateAlertConditions({
    ...payload({ hashrate: 1 }),
    apiUrl: "https://sensitive.example",
    apiToken: "secret-token",
  }, { minimumHashrateKhS: 10 });
  assert.equal(alerts.length, 1);
  assert.doesNotMatch(JSON.stringify(alerts), /sensitive\.example|secret-token/);
});

test("notifications are transition-only and report recovery", () => {
  const config = { minimumHashrateKhS: 50, cooldownMs: 100 };
  const first = transitionAlertState(payload({ hashrate: 20 }), config, {}, 1000);
  assert.deepEqual(first.notifications.map(a => a.id), ["low-hashrate"]);

  const repeated = transitionAlertState(payload({ hashrate: 20 }), config, first.nextState, 1010);
  assert.deepEqual(repeated.notifications, []);

  const recovered = transitionAlertState(payload({ hashrate: 60 }), config, repeated.nextState, 1020);
  assert.deepEqual(recovered.recoveredIds, ["low-hashrate"]);
  assert.deepEqual(recovered.activeIds, []);
});

test("cooldown suppresses a quick re-trigger but permits a later new transition", () => {
  const config = { minimumHashrateKhS: 50, cooldownMs: 100 };
  const first = transitionAlertState(payload({ hashrate: 20 }), config, {}, 1000);
  const recovered = transitionAlertState(payload({ hashrate: 60 }), config, first.nextState, 1010);
  const suppressed = transitionAlertState(payload({ hashrate: 20 }), config, recovered.nextState, 1050);
  assert.deepEqual(suppressed.notifications, []);

  const recoveredAgain = transitionAlertState(payload({ hashrate: 60 }), config, suppressed.nextState, 1060);
  const allowed = transitionAlertState(payload({ hashrate: 20 }), config, recoveredAgain.nextState, 1110);
  assert.deepEqual(allowed.notifications.map(a => a.id), ["low-hashrate"]);
});
