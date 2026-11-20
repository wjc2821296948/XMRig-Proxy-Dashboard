import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => readFileSync(join(root, path), "utf8");

test("Chinese and English READMEs link to their corresponding local alert guide sections", () => {
  assert.match(read("README.md"), /docs\/local-alerts\.md#中文/);
  assert.match(read("README.en.md"), /docs\/local-alerts\.md#english/);
});

test("local alert guide documents thresholds, explicit permission, and browser-visible polling limits", () => {
  const docs = read("docs/local-alerts.md");
  for (const text of ["最低总算力", "最低活跃矿工数", "最高拒绝份额比例", "请求浏览器通知权限", "重新启用通知不会清空已跟踪的告警状态", "界面目前支持简体中文与 English", "localStorage", "标签页隐藏", "page is visible", "Re-enabling notifications does not clear tracked alert state", "The UI currently supports Simplified Chinese and English", "webhooks"]) {
    assert.ok(docs.includes(text), `Missing local-alert documentation: ${text}`);
  }
});

test("README roadmap no longer lists implemented browser alerts and localization as pending", () => {
  assert.match(read("README.md"), /\[x\] \*\*本地告警\/通知\*\*/);
  assert.match(read("README.en.md"), /\[x\] \*\*Local Alerts \/ Notifications\*\*/);
});
