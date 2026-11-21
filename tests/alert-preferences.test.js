import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadAlertSettings, readOptionalThresholdInput, saveAlertSettings } from "../src/alert-preferences.js";
import { DEFAULT_ALERT_COOLDOWN_MS } from "../src/alert-rules.js";

class MemoryStorage {
  #items = new Map();
  getItem(key) { return this.#items.get(key) ?? null; }
  setItem(key, value) { this.#items.set(String(key), String(value)); }
}

let storage;
beforeEach(() => { storage = new MemoryStorage(); });

test("optional threshold input distinguishes invalid browser input from an intentionally blank field", () => {
  assert.equal(readOptionalThresholdInput({ value: "", validity: { badInput: false } }), null);
  assert.ok(Number.isNaN(readOptionalThresholdInput({ value: "", validity: { badInput: true } })));
  assert.equal(readOptionalThresholdInput({ value: " 12.5 ", validity: { badInput: false } }), 12.5);
  assert.ok(Number.isNaN(readOptionalThresholdInput({ value: "-1", validity: { badInput: false } })));
  assert.ok(Number.isNaN(readOptionalThresholdInput({ value: "1e999", validity: { badInput: false } })));
});

test("alert preferences default to disabled rules and the standard cooldown", () => {
  assert.deepEqual(loadAlertSettings(storage), {
    minimumHashrateKhS: null,
    minimumMiners: null,
    maximumRejectedSharePercent: null,
    cooldownMs: DEFAULT_ALERT_COOLDOWN_MS,
  });
});

test("alert preferences persist only normalized threshold and cooldown fields", () => {
  assert.equal(saveAlertSettings({
    minimumHashrateKhS: 12.5,
    minimumMiners: 2,
    maximumRejectedSharePercent: 3,
    cooldownMs: 45000,
    apiUrl: "https://private.example",
    apiToken: "must-not-persist",
  }, storage), true);

  assert.deepEqual(loadAlertSettings(storage), {
    minimumHashrateKhS: 12.5,
    minimumMiners: 2,
    maximumRejectedSharePercent: 3,
    cooldownMs: 45000,
  });
  const serialized = storage.getItem("xmrig_proxy_alert_settings");
  assert.doesNotMatch(serialized, /private\.example|must-not-persist|apiUrl|apiToken/);
});

test("malformed stored preferences safely fall back to defaults", () => {
  storage.setItem("xmrig_proxy_alert_settings", "{broken json");
  assert.deepEqual(loadAlertSettings(storage), {
    minimumHashrateKhS: null,
    minimumMiners: null,
    maximumRejectedSharePercent: null,
    cooldownMs: DEFAULT_ALERT_COOLDOWN_MS,
  });
});

test("storage failures return defaults or a failed save result", () => {
  const blockedStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota exceeded"); },
  };
  assert.equal(loadAlertSettings(blockedStorage).cooldownMs, DEFAULT_ALERT_COOLDOWN_MS);
  assert.equal(saveAlertSettings({ minimumMiners: 1 }, blockedStorage), false);
  assert.equal(saveAlertSettings({ minimumMiners: 1 }, null), false);
});
