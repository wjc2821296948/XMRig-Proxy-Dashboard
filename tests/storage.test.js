import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  clearConfig,
  clearTheme,
  clearWriteAccess,
  loadConfig,
  loadTheme,
  loadWriteAccess,
  saveConfig,
  saveTheme,
  saveWriteAccess,
} from "../src/storage.js";

class MemoryStorage {
  #data = new Map();

  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }

  setItem(key, value) {
    this.#data.set(String(key), String(value));
  }

  removeItem(key) {
    this.#data.delete(key);
  }

  clear() {
    this.#data.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

beforeEach(() => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
});

test("remembered config is stored in localStorage only", () => {
  const cfg = {
    apiUrl: "https://proxy.example:8080",
    apiToken: "secret",
    remember: true,
    refreshInterval: 30,
  };

  saveConfig(cfg);

  assert.deepEqual(loadConfig(), cfg);
  assert.ok(globalThis.localStorage.getItem("xmrig_proxy_config"));
  assert.equal(globalThis.sessionStorage.getItem("xmrig_proxy_config"), null);
});

test("session-only config clears stale localStorage config", () => {
  saveConfig({
    apiUrl: "https://old.example",
    apiToken: "old",
    remember: true,
    refreshInterval: 10,
  });

  const cfg = {
    apiUrl: "https://new.example",
    apiToken: "new",
    remember: false,
    refreshInterval: 45,
  };

  saveConfig(cfg);

  assert.deepEqual(loadConfig(), cfg);
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_config"), null);
});

test("invalid persisted config is discarded and valid session config is recovered", () => {
  globalThis.localStorage.setItem("xmrig_proxy_config", "{bad json");

  const fallback = {
    apiUrl: "https://proxy.example",
    apiToken: "",
    remember: false,
    refreshInterval: 120,
  };
  globalThis.sessionStorage.setItem("xmrig_proxy_config", JSON.stringify(fallback));

  assert.deepEqual(loadConfig(), fallback);
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_config"), null);
});

test("refresh interval is normalized to the supported 1-120 second range", () => {
  globalThis.sessionStorage.setItem(
    "xmrig_proxy_config",
    JSON.stringify({
      apiUrl: "https://proxy.example",
      apiToken: "token",
      remember: false,
      refreshInterval: 999,
    }),
  );

  assert.equal(loadConfig().refreshInterval, 120);

  globalThis.sessionStorage.setItem(
    "xmrig_proxy_config",
    JSON.stringify({
      apiUrl: "https://proxy.example",
      apiToken: "token",
      remember: false,
      refreshInterval: 0,
    }),
  );

  assert.equal(loadConfig().refreshInterval, 10);
});

test("logout removes connection config but preserves the theme preference", () => {
  saveConfig({
    apiUrl: "https://proxy.example",
    apiToken: "token",
    remember: true,
    refreshInterval: 10,
  });
  saveTheme("light");

  clearConfig();

  assert.equal(loadConfig(), null);
  assert.equal(loadTheme(), "light");
});

test("theme storage ignores unsupported values and defaults to dark", () => {
  saveTheme("blue");
  assert.equal(loadTheme(), "dark");

  saveTheme("light");
  assert.equal(loadTheme(), "light");

  clearTheme();
  assert.equal(loadTheme(), "dark");
});

test("write-access decisions are isolated by proxy URL", () => {
  const first = "https://proxy-a.example";
  const second = "https://proxy-b.example";

  saveWriteAccess(true, first);
  saveWriteAccess(false, second);

  assert.equal(loadWriteAccess(first), true);
  assert.equal(loadWriteAccess(second), false);
  assert.equal(loadWriteAccess("https://proxy-c.example"), false);

  clearWriteAccess(first);

  assert.equal(loadWriteAccess(first), false);
  assert.equal(loadWriteAccess(second), false);
});

test("write-access values are coerced to booleans", () => {
  const url = "https://proxy.example";

  saveWriteAccess("yes", url);
  assert.equal(loadWriteAccess(url), true);

  saveWriteAccess(0, url);
  assert.equal(loadWriteAccess(url), false);
});


test("legacy single config is lazily migrated into the first Proxy profile", async () => {
  saveConfig({
    apiUrl: "https://legacy.example:8080",
    apiToken: "legacy-token",
    remember: true,
    refreshInterval: 20,
  });

  const { loadProfiles, loadActiveProfileId, getActiveProfile } = await import("../src/storage.js");
  const profiles = loadProfiles();

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, "legacy-1");
  assert.equal(profiles[0].name, "Proxy 1");
  assert.equal(loadActiveProfileId(), "legacy-1");
  assert.deepEqual(getActiveProfile(), profiles[0]);
});

test("profiles can be created, updated, selected, and deleted without losing other entries", async () => {
  const {
    saveProfile,
    loadProfiles,
    setActiveProfile,
    loadActiveProfileId,
    deleteProfile,
    getActiveProfile,
  } = await import("../src/storage.js");

  saveProfile({
    id: "proxy-a",
    name: "Main",
    apiUrl: "https://main.example:8080",
    apiToken: "a",
    remember: true,
    refreshInterval: 10,
  });
  saveProfile({
    id: "proxy-b",
    name: "Backup",
    apiUrl: "https://backup.example:8080",
    apiToken: "b",
    remember: false,
    refreshInterval: 30,
  });

  assert.deepEqual(loadProfiles().map(profile => profile.name), ["Main", "Backup"]);
  assert.equal(loadActiveProfileId(), "proxy-b");

  const selected = setActiveProfile("proxy-a");
  assert.equal(selected.name, "Main");
  assert.equal(loadActiveProfileId(), "proxy-a");
  assert.equal(getActiveProfile().apiUrl, "https://main.example:8080");

  const deleted = deleteProfile("proxy-a");
  assert.equal(deleted, true);
  assert.equal(loadActiveProfileId(), "proxy-b");
  assert.equal(getActiveProfile().name, "Backup");
});

test("logout clears the active connection but keeps saved profiles", async () => {
  const {
    saveProfile,
    clearConfig,
    loadProfiles,
    loadActiveProfileId,
    getConfig,
  } = await import("../src/storage.js");

  saveProfile({
    id: "proxy-a",
    name: "Main",
    apiUrl: "https://main.example:8080",
    apiToken: "a",
    remember: true,
    refreshInterval: 10,
  });

  clearConfig();

  assert.equal(loadActiveProfileId(), null);
  assert.equal(getConfig(), null);
  assert.equal(loadProfiles().length, 1);
});

test("the last saved Proxy cannot be deleted", async () => {
  const { saveProfile, deleteProfile, loadProfiles } = await import("../src/storage.js");

  saveProfile({
    id: "proxy-only",
    name: "Only",
    apiUrl: "https://only.example:8080",
    apiToken: "",
    remember: true,
    refreshInterval: 10,
  });

  assert.equal(deleteProfile("proxy-only"), false);
  assert.equal(loadProfiles().length, 1);
});


test("non-remembered profile tokens stay in sessionStorage", async () => {
  const { saveProfile, loadProfiles } = await import("../src/storage.js");

  saveProfile({
    id: "session-profile",
    name: "Session",
    apiUrl: "https://session.example:8080",
    apiToken: "session-secret",
    remember: false,
    refreshInterval: 10,
  });

  const rawProfiles = globalThis.localStorage.getItem("xmrig_proxy_profiles");
  assert.ok(rawProfiles);
  assert.equal(rawProfiles.includes("session-secret"), false);
  assert.equal(loadProfiles()[0].apiToken, "session-secret");
  assert.ok(globalThis.sessionStorage.getItem("xmrig_proxy_session_tokens"));
});

test("remembered profile tokens persist with the profile", async () => {
  const { saveProfile, loadProfiles } = await import("../src/storage.js");

  saveProfile({
    id: "remembered-profile",
    name: "Remembered",
    apiUrl: "https://remembered.example:8080",
    apiToken: "persistent-secret",
    remember: true,
    refreshInterval: 10,
  });

  const rawProfiles = globalThis.localStorage.getItem("xmrig_proxy_profiles");
  assert.ok(rawProfiles?.includes("persistent-secret"));
  assert.equal(loadProfiles()[0].apiToken, "persistent-secret");
});
