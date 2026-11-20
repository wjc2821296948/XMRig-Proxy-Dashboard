import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendAlertNotification,
} from "../src/alert-notifications.js";

function createNotificationApi({ permission = "default", requestedPermission = permission, throwOnRequest = false, throwOnConstruct = false } = {}) {
  const instances = [];
  class FakeNotification {
    static permission = permission;
    static requestPermissionCalls = 0;
    static async requestPermission() {
      this.requestPermissionCalls += 1;
      if (throwOnRequest) throw new Error("permission request rejected");
      this.permission = requestedPermission;
      return requestedPermission;
    }
    constructor(title, options) {
      if (throwOnConstruct) throw new Error("notification blocked");
      this.title = title;
      this.options = options;
      instances.push(this);
    }
  }
  return { api: FakeNotification, instances };
}

test("permission inspection is passive and reports unsupported/default/granted/denied", () => {
  assert.equal(getBrowserNotificationPermission(null), "unsupported");
  assert.equal(getBrowserNotificationPermission({}), "unsupported");
  assert.equal(getBrowserNotificationPermission(createNotificationApi({ permission: "default" }).api), "default");
  assert.equal(getBrowserNotificationPermission(createNotificationApi({ permission: "granted" }).api), "granted");
  assert.equal(getBrowserNotificationPermission(createNotificationApi({ permission: "denied" }).api), "denied");

  const { api } = createNotificationApi({ permission: "default" });
  assert.equal(api.requestPermissionCalls, 0);
  assert.equal(getBrowserNotificationPermission(api), "default");
  assert.equal(api.requestPermissionCalls, 0);
});

test("permission is requested only when the explicit request helper is invoked", async () => {
  const { api } = createNotificationApi({ permission: "default", requestedPermission: "granted" });
  assert.equal(api.requestPermissionCalls, 0);
  assert.equal(await requestBrowserNotificationPermission(api), "granted");
  assert.equal(api.requestPermissionCalls, 1);
  assert.equal(getBrowserNotificationPermission(api), "granted");
});

test("permission request handles denied, unsupported, and rejected browser APIs", async () => {
  const denied = createNotificationApi({ permission: "default", requestedPermission: "denied" });
  assert.equal(await requestBrowserNotificationPermission(denied.api), "denied");
  assert.equal(await requestBrowserNotificationPermission(null), "unsupported");

  const rejected = createNotificationApi({ permission: "default", throwOnRequest: true });
  assert.equal(await requestBrowserNotificationPermission(rejected.api), "error");
});

test("notifications dispatch only allowlisted generic messages after permission is granted", () => {
  const { api, instances } = createNotificationApi({ permission: "granted" });
  const sensitiveAlert = {
    id: "low-hashrate",
    message: "https://proxy.private.example token=secret-token raw payload",
    value: 1,
    apiUrl: "https://proxy.private.example",
    apiToken: "secret-token",
  };

  assert.equal(sendAlertNotification(sensitiveAlert, { notificationApi: api, locale: "en" }), true);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].title, "XMRig Proxy Dashboard");
  assert.equal(instances[0].options.body, "Hashrate is below your configured threshold.");
  assert.deepEqual(instances[0].options, {
    body: "Hashrate is below your configured threshold.",
    tag: "xmrig-proxy-alert-low-hashrate",
    renotify: false,
  });
  assert.doesNotMatch(JSON.stringify(instances[0].options), /proxy\.private|secret-token|raw payload/);

  assert.equal(sendAlertNotification({ id: "low-miners" }, { notificationApi: api, locale: "zh-CN" }), true);
  assert.equal(instances[1].options.body, "活跃矿工数量低于你设置的阈值。");

  assert.equal(sendAlertNotification({ id: "low-hashrate" }, { notificationApi: api, locale: "zh-TW" }), true);
  assert.equal(instances[2].options.body, "算力低于你设置的阈值。");
  assert.equal(sendAlertNotification({ id: "low-hashrate" }, { notificationApi: api, locale: "fr" }), true);
  assert.equal(instances[3].options.body, "算力低于你设置的阈值。");
});

test("notifications are suppressed when permission is not granted or alert IDs are unknown", () => {
  const denied = createNotificationApi({ permission: "denied" });
  assert.equal(sendAlertNotification({ id: "low-hashrate" }, { notificationApi: denied.api }), false);
  assert.equal(denied.instances.length, 0);

  const granted = createNotificationApi({ permission: "granted" });
  assert.equal(sendAlertNotification({ id: "unknown-alert" }, { notificationApi: granted.api }), false);
  assert.equal(sendAlertNotification(null, { notificationApi: granted.api }), false);
  assert.equal(granted.instances.length, 0);
});

test("notification constructor failures are handled without throwing", () => {
  const blocked = createNotificationApi({ permission: "granted", throwOnConstruct: true });
  assert.equal(sendAlertNotification({ id: "low-miners" }, { notificationApi: blocked.api }), false);
});
