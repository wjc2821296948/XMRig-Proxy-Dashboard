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
  assert.match(main, /readOptionalThresholdInput\(document\.getElementById\(id\)\)/);
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
});
