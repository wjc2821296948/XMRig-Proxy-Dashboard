import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  clearConfig,
  clearTheme,
  consumeStorageRecoveryWarning,
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
  // Replace, rather than merely clear, storage shims so a failure-mode fixture
  // cannot leak a blocked/quota-exceeded implementation into later tests.
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  consumeStorageRecoveryWarning();
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

  saveTheme("system");
  assert.equal(loadTheme(), "system");

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


test("session-only tokens persist for profile IDs that are special object keys", async () => {
  const { saveProfile, loadProfiles } = await import("../src/storage.js");

  saveProfile({
    id: "__proto__",
    name: "Special ID",
    apiUrl: "https://special.example:8080",
    apiToken: "session-secret",
    remember: false,
    refreshInterval: 10,
  });

  const rawTokens = globalThis.sessionStorage.getItem("xmrig_proxy_session_tokens");
  assert.ok(rawTokens);
  assert.equal(JSON.parse(rawTokens)["__proto__"], "session-secret");
  assert.equal(loadProfiles()[0].apiToken, "session-secret");
});

test("missing session token for a profile named constructor does not inherit Object.prototype", async () => {
  const { saveProfile, loadProfiles } = await import("../src/storage.js");

  saveProfile({
    id: "constructor",
    name: "Special ID",
    apiUrl: "https://special.example:8080",
    apiToken: "temporary-secret",
    remember: false,
    refreshInterval: 10,
  });

  globalThis.sessionStorage.setItem("xmrig_proxy_session_tokens", "{}");
  assert.equal(loadProfiles()[0].apiToken, "");
});

test("special profile IDs remain ordinary own keys when tokens are removed", async () => {
  const { saveProfile, deleteProfile, loadProfiles } = await import("../src/storage.js");

  saveProfile({
    id: "__proto__",
    name: "Proto",
    apiUrl: "https://proto.example:8080",
    apiToken: "proto-secret",
    remember: false,
    refreshInterval: 10,
  });
  saveProfile({
    id: "ordinary",
    name: "Ordinary",
    apiUrl: "https://ordinary.example:8080",
    apiToken: "ordinary-secret",
    remember: false,
    refreshInterval: 10,
  });

  assert.equal(deleteProfile("__proto__"), true);
  assert.equal(loadProfiles()[0].apiToken, "ordinary-secret");
  assert.equal(JSON.parse(globalThis.sessionStorage.getItem("xmrig_proxy_session_tokens")).ordinary, "ordinary-secret");
});


test("malformed and non-object session token payloads safely fall back to empty tokens", async () => {
  const { saveProfile, loadProfiles } = await import("../src/storage.js");

  saveProfile({
    id: "constructor",
    name: "Special ID",
    apiUrl: "https://special.example:8080",
    apiToken: "temporary-secret",
    remember: false,
    refreshInterval: 10,
  });

  for (const malformed of ["{bad json", "null", "[]", '"token-string"']) {
    globalThis.sessionStorage.setItem("xmrig_proxy_session_tokens", malformed);
    assert.equal(loadProfiles()[0].apiToken, "", `payload ${malformed} should not produce an inherited token`);
  }
});


test("session token map rejects non-string and oversized credentials", async () => {
  const { saveProfile, loadProfiles } = await import("../src/storage.js");
  saveProfile({
    id: "session-profile-token-validation",
    name: "Session token validation",
    apiUrl: "https://session.example:8080",
    apiToken: "valid-token",
    remember: false,
    refreshInterval: 10,
  });

  const malformedValues = [
    { apiToken: "object-value" },
    ["array-token"],
    123,
    null,
    "x".repeat(4097),
  ];
  for (const malformed of malformedValues) {
    globalThis.sessionStorage.setItem(
      "xmrig_proxy_session_tokens",
      JSON.stringify({ "session-profile-token-validation": malformed }),
    );
    assert.equal(
      loadProfiles()[0].apiToken,
      "",
      `malformed token value ${typeof malformed} must never be returned as a credential`,
    );
  }

  globalThis.sessionStorage.setItem("xmrig_proxy_session_tokens", JSON.stringify({
    "session-profile-token-validation": "valid-token",
  }));
  assert.equal(loadProfiles()[0].apiToken, "valid-token");
});


test("storage reads that throw degrade to empty config and default theme", () => {
  class BlockedStorage extends MemoryStorage {
    getItem() { throw new DOMException("blocked", "SecurityError"); }
    setItem() { throw new DOMException("blocked", "SecurityError"); }
    removeItem() { throw new DOMException("blocked", "SecurityError"); }
  }
  globalThis.localStorage = new BlockedStorage();
  globalThis.sessionStorage = new BlockedStorage();

  assert.equal(loadConfig(), null);
  assert.equal(loadTheme(), "dark");
  assert.equal(saveConfig({ apiUrl: "https://proxy.example", apiToken: "", remember: true, refreshInterval: 10 }), false);
  clearConfig();
  clearTheme();
});

test("quota errors do not report profile or config saves as successful", async () => {
  class QuotaStorage extends MemoryStorage {
    setItem() { throw new DOMException("quota exceeded", "QuotaExceededError"); }
  }
  globalThis.localStorage = new QuotaStorage();
  globalThis.sessionStorage = new QuotaStorage();
  const { saveProfile } = await import("../src/storage.js");

  assert.equal(saveConfig({ apiUrl: "https://proxy.example", apiToken: "", remember: true, refreshInterval: 10 }), false);
  assert.equal(saveProfile({ id: "quota-profile", name: "Quota", apiUrl: "https://proxy.example", apiToken: "secret", remember: true, refreshInterval: 10 }), null);
});


test("remembered profiles still save when sessionStorage writes are blocked", async () => {
  class BlockedSessionStorage extends MemoryStorage {
    setItem() { throw new DOMException("blocked", "SecurityError"); }
  }
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new BlockedSessionStorage();
  const { saveProfile } = await import("../src/storage.js");

  const profile = saveProfile({
    id: "persistent-only",
    name: "Persistent",
    apiUrl: "https://proxy.example",
    apiToken: "secret",
    remember: true,
    refreshInterval: 10,
  });
  assert.equal(profile?.id, "persistent-only");
});


test("session-only config remains usable when localStorage is inaccessible", () => {
  class BlockedLocalStorage extends MemoryStorage {
    getItem() { throw new DOMException("blocked", "SecurityError"); }
    removeItem() { throw new DOMException("blocked", "SecurityError"); }
    setItem() { throw new DOMException("blocked", "SecurityError"); }
  }
  globalThis.localStorage = new BlockedLocalStorage();
  globalThis.sessionStorage = new MemoryStorage();
  const cfg = { apiUrl: "https://session.example", apiToken: "", remember: false, refreshInterval: 10 };

  assert.equal(saveConfig(cfg), true);
  assert.deepEqual(loadConfig(), cfg);
});

test("session-only config does not shadow a readable persistent config when cleanup fails", () => {
  class CannotRemoveLocalStorage extends MemoryStorage {
    removeItem() { throw new DOMException("locked", "SecurityError"); }
  }
  globalThis.localStorage = new CannotRemoveLocalStorage();
  globalThis.localStorage.setItem("xmrig_proxy_config", JSON.stringify({
    apiUrl: "https://old.example", apiToken: "old", remember: true, refreshInterval: 10,
  }));

  assert.equal(saveConfig({ apiUrl: "https://new.example", apiToken: "", remember: false, refreshInterval: 10 }), false);
  assert.equal(loadConfig().apiUrl, "https://old.example");
});

test("write-access persistence reports quota failures", async () => {
  class QuotaStorage extends MemoryStorage {
    setItem() { throw new DOMException("quota exceeded", "QuotaExceededError"); }
  }
  globalThis.localStorage = new QuotaStorage();
  const { saveWriteAccess } = await import("../src/storage.js");
  assert.equal(saveWriteAccess(true, "https://proxy.example"), false);
});


test("clearConfig overwrites credentials when removeItem fails but writes work", () => {
  class CannotRemoveLocalStorage extends MemoryStorage {
    removeItem() { throw new DOMException("remove blocked", "SecurityError"); }
  }
  globalThis.localStorage = new CannotRemoveLocalStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.localStorage.setItem("xmrig_proxy_config", JSON.stringify({
    apiUrl: "https://local.example", apiToken: "local-secret", remember: true, refreshInterval: 10,
  }));
  globalThis.localStorage.setItem("xmrig_proxy_active_profile", "profile-id");
  globalThis.sessionStorage.setItem("xmrig_proxy_config", JSON.stringify({
    apiUrl: "https://session.example", apiToken: "session-secret", remember: false, refreshInterval: 10,
  }));
  globalThis.sessionStorage.setItem("xmrig_proxy_session_tokens", JSON.stringify({ profile: "session-secret" }));

  assert.equal(clearConfig(), true);
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_config"), "");
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_active_profile"), "");
  assert.equal(globalThis.sessionStorage.getItem("xmrig_proxy_config"), null);
  assert.equal(globalThis.sessionStorage.getItem("xmrig_proxy_session_tokens"), null);
});

test("clearConfig reports partial cleanup when credential storage is fully blocked", () => {
  class PartiallyBlockedLocalStorage extends MemoryStorage {
    constructor() {
      super();
      this.locked = false;
    }
    setItem(key, value) {
      if (this.locked) throw new DOMException("storage blocked", "SecurityError");
      super.setItem(key, value);
    }
    removeItem() { throw new DOMException("remove blocked", "SecurityError"); }
  }
  const local = new PartiallyBlockedLocalStorage();
  local.setItem("xmrig_proxy_config", JSON.stringify({
    apiUrl: "https://local.example", apiToken: "local-secret", remember: true, refreshInterval: 10,
  }));
  local.locked = true;
  globalThis.localStorage = local;
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.sessionStorage.setItem("xmrig_proxy_config", JSON.stringify({
    apiUrl: "https://session.example", apiToken: "session-secret", remember: false, refreshInterval: 10,
  }));
  globalThis.sessionStorage.setItem("xmrig_proxy_session_tokens", JSON.stringify({ profile: "session-secret" }));

  assert.equal(clearConfig(), false);
  assert.ok(globalThis.localStorage.getItem("xmrig_proxy_config").includes("local-secret"));
  assert.equal(globalThis.sessionStorage.getItem("xmrig_proxy_config"), null);
  assert.equal(globalThis.sessionStorage.getItem("xmrig_proxy_session_tokens"), null);
});


test("profile remember flags distinguish absent legacy values from malformed values", async () => {
  const { saveProfile, loadProfiles } = await import("../src/storage.js");

  const malformed = saveProfile({
    id: "bad-remember",
    name: "Bad remember",
    apiUrl: "https://proxy.example:8080",
    apiToken: "session-secret",
    remember: null,
    refreshInterval: 10,
  });
  assert.equal(malformed.remember, false);
  assert.equal(JSON.parse(globalThis.localStorage.getItem("xmrig_proxy_profiles")).find(p => p.id === "bad-remember").apiToken, undefined);
  assert.equal(loadProfiles().find(p => p.id === "bad-remember").apiToken, "session-secret");

  const legacy = saveProfile({
    id: "legacy-no-remember",
    name: "Legacy",
    apiUrl: "https://legacy.example:8080",
    apiToken: "persistent-secret",
    refreshInterval: 10,
  });
  assert.equal(legacy.remember, true);
});


test("corrupt local config cannot block a valid session config when removal is denied", () => {
  class CannotRemoveStorage extends MemoryStorage {
    removeItem() { throw new DOMException("remove denied", "SecurityError"); }
  }
  globalThis.localStorage = new CannotRemoveStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.localStorage.setItem("xmrig_proxy_config", "{bad json");
  const fallback = {
    apiUrl: "https://session.example",
    apiToken: "session-token",
    remember: false,
    refreshInterval: 10,
  };
  globalThis.sessionStorage.setItem("xmrig_proxy_config", JSON.stringify(fallback));

  assert.deepEqual(loadConfig(), fallback);
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_config"), "");
});


test("storage limits reject oversized config, tokens, URLs, and profile names", async () => {
  const { saveProfile } = await import("../src/storage.js");
  const base = { apiUrl: "https://proxy.example:8080", apiToken: "token", remember: true, refreshInterval: 10 };

  assert.equal(saveConfig({ ...base, apiToken: "x".repeat(5000) }), false);
  assert.equal(saveConfig({ ...base, apiUrl: "https://proxy.example/" + "x".repeat(3000) }), false);
  assert.equal(saveConfig({ ...base, padding: "x".repeat(110 * 1024) }), false);

  assert.equal(saveProfile({
    id: "oversized-token", name: "Token", apiUrl: base.apiUrl,
    apiToken: "x".repeat(5000), remember: true, refreshInterval: 10,
  }), null);
  assert.equal(saveProfile({
    id: "oversized-url", name: "URL", apiUrl: "https://proxy.example/" + "x".repeat(3000),
    apiToken: "token", remember: true, refreshInterval: 10,
  }), null);
  assert.equal(saveProfile({
    id: "oversized-name", name: "x".repeat(129), apiUrl: base.apiUrl,
    apiToken: "token", remember: true, refreshInterval: 10,
  }), null);
});

test("non-string saved profile tokens are never persisted as credentials", async () => {
  const { saveProfile, loadProfiles } = await import("../src/storage.js");
  const saved = saveProfile({
    id: "object-token", name: "Object token", apiUrl: "https://proxy.example:8080",
    apiToken: { secret: "unexpected" }, remember: true, refreshInterval: 10,
  });
  assert.equal(saved.apiToken, "");
  assert.equal(loadProfiles().find(p => p.id === "object-token").apiToken, "");
});



test("unremovable corrupt config still falls back and surfaces a cleanup warning", async () => {
  const blocked = {
    data: new Map([["xmrig_proxy_config", "{bad json"]]),
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; },
    setItem() { throw new DOMException("storage locked", "SecurityError"); },
    removeItem() { throw new DOMException("storage locked", "SecurityError"); },
    clear() { this.data.clear(); },
  };
  globalThis.localStorage = blocked;
  globalThis.sessionStorage = new MemoryStorage();
  const fallback = {
    apiUrl: "https://session.example",
    apiToken: "session-token",
    remember: false,
    refreshInterval: 10,
  };
  globalThis.sessionStorage.setItem("xmrig_proxy_config", JSON.stringify(fallback));

  const { consumeConfigCleanupWarning } = await import("../src/storage.js");
  assert.deepEqual(loadConfig(), fallback);
  assert.equal(consumeConfigCleanupWarning(), true);
  assert.equal(consumeConfigCleanupWarning(), false);
});

test("failed session-only profile switches restore the previous active connection", async () => {
  // Previous tests intentionally replace storage with throwing shims; start from usable stores.
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  const { saveProfile, setActiveProfile, loadActiveProfileId, loadConfig } = await import("../src/storage.js");
  saveProfile({
    id: "remembered-before-switch", name: "Remembered", apiUrl: "https://remembered.example",
    apiToken: "persistent", remember: true, refreshInterval: 10,
  });
  saveProfile({
    id: "session-target", name: "Session", apiUrl: "https://session.example",
    apiToken: "temporary", remember: false, refreshInterval: 10,
  });
  setActiveProfile("remembered-before-switch");

  const workingSessionStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    getItem: key => workingSessionStorage.getItem(key),
    removeItem: key => workingSessionStorage.removeItem(key),
    setItem(key, value) {
      if (key === "xmrig_proxy_config") throw new DOMException("write denied", "QuotaExceededError");
      workingSessionStorage.setItem(key, value);
    },
    clear: () => workingSessionStorage.clear(),
  };

  assert.equal(setActiveProfile("session-target"), null);
  assert.equal(loadActiveProfileId(), "remembered-before-switch");
  assert.equal(loadConfig().apiUrl, "https://remembered.example");
});


test("active profile ID and connection config remain consistent if active ID persistence fails", async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  const { saveProfile, setActiveProfile, loadActiveProfileId, loadConfig } = await import("../src/storage.js");
  saveProfile({
    id: "config-before-id", name: "Remembered", apiUrl: "https://remembered.example",
    apiToken: "persistent", remember: true, refreshInterval: 10,
  });
  saveProfile({
    id: "session-target-id-fails", name: "Session", apiUrl: "https://session.example",
    apiToken: "temporary", remember: false, refreshInterval: 10,
  });
  assert.ok(setActiveProfile("config-before-id"));

  const workingLocal = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => workingLocal.getItem(key),
    removeItem: key => workingLocal.removeItem(key),
    setItem(key, value) {
      if (key === "xmrig_proxy_active_profile") throw new DOMException("active ID write denied", "QuotaExceededError");
      workingLocal.setItem(key, value);
    },
    clear: () => workingLocal.clear(),
  };

  assert.equal(setActiveProfile("session-target-id-fails"), null);
  assert.equal(loadActiveProfileId(), "config-before-id");
  assert.equal(loadConfig().apiUrl, "https://remembered.example");
});


test("failed active profile deletion restores the profile list, ID, and connection", async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  const { saveProfile, setActiveProfile, deleteProfile, loadProfiles, loadActiveProfileId, loadConfig } = await import("../src/storage.js");

  saveProfile({
    id: "keep-profile", name: "Keep", apiUrl: "https://keep.example",
    apiToken: "keep-token", remember: true, refreshInterval: 10,
  });
  saveProfile({
    id: "remove-profile", name: "Remove", apiUrl: "https://remove.example",
    apiToken: "remove-token", remember: false, refreshInterval: 10,
  });
  assert.ok(setActiveProfile("remove-profile"));

  const workingSession = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    getItem: key => workingSession.getItem(key),
    removeItem: key => workingSession.removeItem(key),
    setItem(key, value) {
      if (key === "xmrig_proxy_session_tokens") {
        throw new DOMException("token map write denied", "QuotaExceededError");
      }
      workingSession.setItem(key, value);
    },
    clear: () => workingSession.clear(),
  };

  assert.equal(deleteProfile("remove-profile"), false);
  assert.deepEqual(loadProfiles().map(p => p.id).sort(), ["keep-profile", "remove-profile"]);
  assert.equal(loadActiveProfileId(), "remove-profile");
  assert.equal(loadConfig().apiUrl, "https://remove.example");
  assert.equal(JSON.parse(workingSession.getItem("xmrig_proxy_session_tokens"))["remove-profile"], "remove-token");
});


test("saveConfig fails closed on malformed remember flags", () => {
  const config = {
    apiUrl: "https://proxy.example:8080",
    apiToken: "temporary-secret",
    remember: null,
    refreshInterval: 10,
  };
  assert.equal(saveConfig(config), true);
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_config"), null);
  const raw = JSON.parse(globalThis.sessionStorage.getItem("xmrig_proxy_config"));
  assert.equal(raw.remember, false);
  assert.equal(raw.apiToken, "temporary-secret");
  assert.equal(loadConfig().remember, false);
});

test("loadConfig never returns malformed or oversized credentials as a usable token", () => {
  globalThis.localStorage.setItem("xmrig_proxy_config", JSON.stringify({
    apiUrl: "https://proxy.example:8080",
    apiToken: { secret: "must-not-be-sent" },
    remember: null,
    refreshInterval: 10,
  }));
  assert.equal(loadConfig(), null);
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_config"), null);

  globalThis.localStorage.setItem("xmrig_proxy_config", JSON.stringify({
    apiUrl: "https://proxy.example:8080",
    apiToken: "x".repeat(5000),
    remember: true,
    refreshInterval: 10,
  }));
  assert.equal(loadConfig(), null);
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_config"), null);
});


test("local configs with malformed or false remember flags migrate to session storage", () => {
  const config = {
    apiUrl: "https://proxy.example:8080",
    apiToken: "temporary-secret",
    remember: null,
    refreshInterval: 10,
  };
  globalThis.localStorage.setItem("xmrig_proxy_config", JSON.stringify(config));

  assert.deepEqual(loadConfig(), { ...config, remember: false });
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_config"), null);
  assert.equal(JSON.parse(globalThis.sessionStorage.getItem("xmrig_proxy_config")).remember, false);
});


test("remembered config save rolls back when stale session config cannot be cleared", () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  const previous = {
    apiUrl: "https://previous.example:8080",
    apiToken: "previous-token",
    remember: true,
    refreshInterval: 10,
  };
  assert.equal(saveConfig(previous), true);
  globalThis.sessionStorage.setItem("xmrig_proxy_config", JSON.stringify({
    apiUrl: "https://stale.example:8080",
    apiToken: "stale-token",
    remember: false,
    refreshInterval: 10,
  }));

  const workingSession = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    getItem: key => workingSession.getItem(key),
    removeItem() { throw new DOMException("remove denied", "SecurityError"); },
    setItem() { throw new DOMException("write denied", "SecurityError"); },
    clear: () => workingSession.clear(),
  };

  assert.equal(saveConfig({
    apiUrl: "https://new.example:8080",
    apiToken: "new-token",
    remember: true,
    refreshInterval: 10,
  }), false);
  assert.equal(JSON.parse(globalThis.localStorage.getItem("xmrig_proxy_config")).apiUrl, "https://previous.example:8080");
  assert.equal(JSON.parse(workingSession.getItem("xmrig_proxy_config")).apiToken, "stale-token");
});

test("profile save rolls back all keys when active ID persistence fails", async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  const { saveProfile, loadProfiles, loadActiveProfileId, getConfig } = await import("../src/storage.js");

  assert.ok(saveProfile({
    id: "profile-stable", name: "Stable", apiUrl: "https://stable.example:8080",
    apiToken: "stable-token", remember: true, refreshInterval: 10,
  }));
  const workingLocal = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => workingLocal.getItem(key),
    removeItem: key => workingLocal.removeItem(key),
    setItem(key, value) {
      if (key === "xmrig_proxy_active_profile" && value === "profile-new") {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
      workingLocal.setItem(key, value);
    },
    clear: () => workingLocal.clear(),
  };

  assert.equal(saveProfile({
    id: "profile-new", name: "New", apiUrl: "https://new.example:8080",
    apiToken: "new-token", remember: false, refreshInterval: 10,
  }), null);
  assert.deepEqual(loadProfiles().map(p => p.id), ["profile-stable"]);
  assert.equal(loadActiveProfileId(), "profile-stable");
  assert.equal(getConfig().apiUrl, "https://stable.example:8080");
  assert.equal(globalThis.sessionStorage.getItem("xmrig_proxy_session_tokens"), null);
});


test("remembered config refuses to overwrite credentials when existing storage cannot be read", () => {
  const backing = new MemoryStorage();
  const previous = JSON.stringify({
    apiUrl: "https://previous.example",
    apiToken: "previous-token",
    remember: true,
    refreshInterval: 10,
  });
  backing.setItem("xmrig_proxy_config", previous);
  let writes = 0;
  globalThis.localStorage = {
    getItem() { throw new DOMException("read blocked", "SecurityError"); },
    setItem(key, value) { writes += 1; backing.setItem(key, value); },
    removeItem(key) { backing.removeItem(key); },
    clear() { backing.clear(); },
  };
  globalThis.sessionStorage = new MemoryStorage();

  assert.equal(saveConfig({
    apiUrl: "https://new.example",
    apiToken: "new-token",
    remember: true,
    refreshInterval: 10,
  }), false);
  assert.equal(writes, 0, "do not overwrite unreadable prior credentials");
  assert.equal(backing.getItem("xmrig_proxy_config"), previous);
});


test("profile save reports a partial rollback when prior profile list cannot be restored", async () => {
  const { saveProfile, loadProfiles, loadActiveProfileId } = await import("../src/storage.js");
  assert.ok(saveProfile({
    id: "stable-profile", name: "Stable", apiUrl: "https://stable.example",
    apiToken: "stable-token", remember: true, refreshInterval: 10,
  }));

  const backing = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => backing.getItem(key),
    removeItem: key => backing.removeItem(key),
    clear: () => backing.clear(),
    setItem(key, value) {
      if (key === "xmrig_proxy_active_profile" && value === "new-profile") {
        throw new DOMException("active ID write denied", "QuotaExceededError");
      }
      if (key === "xmrig_proxy_profiles") {
        const ids = JSON.parse(value).map(profile => profile.id);
        if (!ids.includes("new-profile")) {
          throw new DOMException("rollback blocked", "QuotaExceededError");
        }
      }
      backing.setItem(key, value);
    },
  };

  assert.equal(saveProfile({
    id: "new-profile", name: "New", apiUrl: "https://new.example",
    apiToken: "new-token", remember: true, refreshInterval: 10,
  }), null);
  assert.deepEqual(loadProfiles().map(profile => profile.id).sort(), ["new-profile", "stable-profile"]);
  assert.equal(loadActiveProfileId(), "stable-profile");
  assert.equal(consumeStorageRecoveryWarning(), true);
  assert.equal(consumeStorageRecoveryWarning(), false, "warning is one-shot");
});


test("profile deletion reports when rollback cannot restore the active profile ID", async () => {
  const { saveProfile, deleteProfile, loadProfiles, loadActiveProfileId } = await import("../src/storage.js");
  assert.ok(saveProfile({
    id: "keep-profile", name: "Keep", apiUrl: "https://keep.example",
    apiToken: "keep-token", remember: true, refreshInterval: 10,
  }));
  assert.ok(saveProfile({
    id: "delete-profile", name: "Delete", apiUrl: "https://delete.example",
    apiToken: "delete-token", remember: true, refreshInterval: 10,
  }));

  const backing = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => backing.getItem(key),
    removeItem: key => backing.removeItem(key),
    clear: () => backing.clear(),
    setItem(key, value) {
      if (key === "xmrig_proxy_profiles" && !JSON.parse(value).some(profile => profile.id === "delete-profile")) {
        throw new DOMException("profile deletion write denied", "QuotaExceededError");
      }
      if (key === "xmrig_proxy_active_profile" && value === "delete-profile") {
        throw new DOMException("active ID rollback denied", "QuotaExceededError");
      }
      backing.setItem(key, value);
    },
  };

  assert.equal(deleteProfile("delete-profile"), false);
  assert.deepEqual(loadProfiles().map(profile => profile.id).sort(), ["delete-profile", "keep-profile"]);
  assert.equal(loadActiveProfileId(), "keep-profile", "active ID rollback failed and must be reported");
  assert.equal(loadConfig().apiUrl, "https://delete.example", "connection config may no longer match the active profile ID");
  assert.equal(consumeStorageRecoveryWarning(), true);
});


test("failed remembered-config rollback never reactivates malformed prior config", () => {
  globalThis.localStorage.setItem("xmrig_proxy_config", "{malformed prior config");
  globalThis.sessionStorage.setItem("xmrig_proxy_config", JSON.stringify({
    apiUrl: "https://stale.example", apiToken: "stale-token", remember: false, refreshInterval: 10,
  }));
  const backing = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    getItem: key => backing.getItem(key),
    removeItem() { throw new DOMException("remove blocked", "SecurityError"); },
    setItem() { throw new DOMException("write blocked", "SecurityError"); },
    clear: () => backing.clear(),
  };

  assert.equal(saveConfig({
    apiUrl: "https://new.example", apiToken: "new-token", remember: true, refreshInterval: 10,
  }), false);
  assert.equal(globalThis.localStorage.getItem("xmrig_proxy_config"), null);
  assert.equal(consumeStorageRecoveryWarning(), true, "stale session credentials could not be invalidated");
});


test("profile lookup distinguishes a missing profile from unavailable storage", async () => {
  const { saveProfile, getProfileById } = await import("../src/storage.js");
  assert.ok(saveProfile({
    id: "known-profile", name: "Known", apiUrl: "https://known.example",
    apiToken: "token", remember: true, refreshInterval: 10,
  }));
  assert.equal(getProfileById("missing-profile").status, "not-found");
  assert.equal(getProfileById("known-profile").status, "found");

  const backing = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new DOMException("storage unavailable", "SecurityError"); },
    setItem: (key, value) => backing.setItem(key, value),
    removeItem: key => backing.removeItem(key),
    clear: () => backing.clear(),
  };
  assert.equal(getProfileById("known-profile").status, "storage-unavailable");
});
