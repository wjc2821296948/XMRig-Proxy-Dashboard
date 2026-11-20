import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { translateUiText } from "../src/i18n-ui.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const main = readFileSync(join(root, "src/main.js"), "utf8");
const css = readFileSync(join(root, "styles.css"), "utf8");

test("settings modal exposes all local alert thresholds and cooldown controls", () => {
  for (const id of ["sAlertHashrate", "sAlertMiners", "sAlertRejected", "sAlertCooldown", "saveAlertSettings"]) {
    assert.match(main, new RegExp(`id="${id}"`));
  }
  assert.match(main, /aria-labelledby="alertSettingsTitle"/);
  assert.match(main, /只在当前浏览器评估；不会上传 Proxy 地址、Token 或原始监控数据。/);
  assert.match(main, /saveAlertSettingsButton\.addEventListener\("click"/);
  assert.match(main, /if \(!cooldownRaw\)/);
  assert.match(main, /placeholder="0 表示不等待" required/);
});

test("alert settings are saved separately from Proxy profile changes", () => {
  assert.match(main, /saveAlertSettings\(\{/);
  assert.match(main, /showToast\(\s*saved \? "本地告警设置已保存"/);
  assert.doesNotMatch(main, /Notification\.requestPermission/);
});

test("alert settings layout adapts to narrow screens", () => {
  assert.match(css, /\.alert-settings-grid\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /@media\s*\(max-width:\s*520px\)\s*\{\s*\.alert-settings-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

test("alert settings copy is translated for English locale", () => {
  assert.equal(translateUiText("本地告警设置", "en"), "Local alert settings");
  assert.equal(translateUiText("最低总算力（KH/s）", "en"), "Minimum total hashrate (KH/s)");
  assert.equal(translateUiText("保存告警设置", "en"), "Save alert settings");
  assert.equal(translateUiText("请求浏览器通知权限", "en"), "Request browser notification permission");
  assert.equal(translateUiText("接收浏览器通知", "en"), "Receive browser notifications");
});

test("browser notification permission is requested only from the explicit settings button", () => {
  const handlerStart = main.indexOf('browserAlertPermissionButton.addEventListener("click"');
  const handlerEnd = main.indexOf('browserAlertToggle.addEventListener("change"', handlerStart);
  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  const handler = main.slice(handlerStart, handlerEnd);
  assert.match(handler, /await requestBrowserNotificationPermission\(\)/);
  assert.match(main, /id="requestBrowserAlertPermission"/);
  assert.match(main, /id="enableBrowserAlertNotifications"/);
  assert.match(main, /browserAlertToggle\.addEventListener\("change"/);
});

test("fresh Proxy summaries enter local alert evaluation but offline cached snapshots do not", () => {
  const freshPath = main.slice(main.indexOf("async function fetchAndRender()"), main.indexOf("function startAutoRefresh()"));
  assert.match(freshPath, /await request\("\/1\/summary"/);
  assert.match(freshPath, /processLocalAlerts\(data\)/);
  assert.ok(freshPath.indexOf("controller.signal.aborted") < freshPath.indexOf("processLocalAlerts(data)"));
  assert.doesNotMatch(main.slice(main.indexOf("function renderCachedSummary"), main.indexOf("async function fetchAndRender()")), /processLocalAlerts/);
});


test("turning notifications off preserves transition history; turning them on starts a fresh notification cycle", () => {
  const toggleStart = main.indexOf('browserAlertToggle.addEventListener("change"');
  const toggleEnd = main.indexOf('updateBrowserAlertPermissionUI();', toggleStart);
  const handler = main.slice(toggleStart, toggleEnd);
  assert.match(handler, /if \(enabled\) alertTransitionState = \{\};/);
  assert.doesNotMatch(handler, /(^|[;\n])\s*alertTransitionState = \{\};/);
});
