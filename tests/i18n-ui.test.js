import { test } from "node:test";
import assert from "node:assert/strict";
import { translateUiText } from "../src/i18n-ui.js";

test("translates common dashboard and settings labels without changing Chinese mode", () => {
  assert.equal(translateUiText("当前算力", "en"), "Current hashrate");
  assert.equal(translateUiText("当前算力", "zh-CN"), "当前算力");
  assert.equal(translateUiText("XMRig Proxy 仪表盘", "en"), "XMRig Proxy Dashboard");
  assert.equal(translateUiText("语言", "en"), "Language");
  assert.equal(translateUiText("简体中文", "en"), "Simplified Chinese");
  assert.equal(translateUiText("  设置  ", "en"), "  Settings  ");
});

test("translates dynamic dashboard labels while preserving their values", () => {
  assert.equal(translateUiText("Worker: rig-01 | 版本: 6.24", "en"), "Worker: rig-01 | Version: 6.24");
  assert.equal(translateUiText("缓存时间: 2026/11/15 14:00", "en"), "Cached at: 2026/11/15 14:00");
  assert.equal(translateUiText("峰值: 120 矿工", "en"), "Peak: 120 miners");
  assert.equal(translateUiText("比率: 4.5 矿工/上游", "en"), "Ratio: 4.5 miners/upstream");
  assert.equal(translateUiText("连接失败: Network error", "en"), "Connection failed: Network error");
  assert.equal(translateUiText("  缓存时间: same same  ", "en"), "  Cached at: same same  ");
  assert.equal(translateUiText("  连接失败: Network error Network error  ", "en"), "  Connection failed: Network error Network error  ");
});

test("unknown and non-string values remain unchanged", () => {
  assert.equal(translateUiText("a user-defined profile name", "en"), "a user-defined profile name");
  assert.equal(translateUiText(42, "en"), 42);
});
