import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLocale, setLocalizedText, translateUiText } from "../src/i18n-ui.js";

test("translates common dashboard and settings labels without changing Chinese mode", () => {
  assert.equal(translateUiText("当前算力", "en"), "Current hashrate");
  assert.equal(translateUiText("当前算力", "zh-CN"), "当前算力");
  assert.equal(translateUiText("XMRig Proxy 仪表盘", "en"), "XMRig Proxy Dashboard");
  assert.equal(translateUiText("语言", "en"), "Language");
  assert.equal(translateUiText("简体中文", "en"), "Simplified Chinese");
  assert.equal(translateUiText("  设置  ", "en"), "  Settings  ");
  assert.equal(translateUiText("设置 设置", "en"), "设置 设置");
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


test("translates snapshot export and manual refresh controls and lifecycle messages", () => {
  const cases = [
    ["导出快照", "Export snapshot"],
    ["导出当前监控指标为 JSON 文件", "Export current monitoring metrics as a JSON file"],
    ["下载当前指标快照；不包含 Proxy URL 或 Token", "Download a snapshot of current metrics; excludes the Proxy URL and token"],
    ["立即刷新", "Refresh now"],
    ["立即刷新监控数据", "Refresh monitoring data now"],
    ["立即获取最新的 Proxy 监控数据", "Fetch the latest Proxy monitoring data now"],
    ["刷新中…", "Refreshing…"],
    ["正在刷新监控数据", "Refreshing monitoring data"],
    ["刷新已取消", "Refresh cancelled"],
    ["手动刷新失败", "Manual refresh failed"],
    ["手动刷新失败，请检查 Proxy 连接", "Manual refresh failed. Check the Proxy connection."],
    ["监控数据刷新完成", "Monitoring data refresh completed"],
  ];
  for (const [source, expected] of cases) {
    assert.equal(translateUiText(source, "en"), expected, source);
  }
});

test("translates settings controls and the nested backup dialog", () => {
  const cases = [
    ["⚙ 设置", "⚙ Settings"],
    ["删除", "Delete"],
    ["选择备份内容", "Choose backup contents"],
    ["请选择是否把 Proxy 访问 Token 一并写入备份文件。文件只会在本机生成并下载，不会上传。", "Choose whether to include Proxy access tokens in the backup. The file is generated and downloaded locally; nothing is uploaded."],
    ["完整备份（包含 Token）", "Full backup (include tokens)"],
    ["脱敏备份（不包含 Token）", "Redacted backup (exclude tokens)"],
    ["完整备份可直接迁移连接凭据；脱敏备份会把所有 Token 留空，导入后需要重新填写。", "A full backup transfers credentials. A redacted backup leaves tokens blank; enter them again after importing."],
  ];
  for (const [source, expected] of cases) {
    assert.equal(translateUiText(source, "en"), expected, source);
  }
});

test("translates dynamic profile accessibility labels and import confirmation prompts", () => {
  assert.equal(translateUiText("删除 主 Proxy", "en"), "Delete 主 Proxy");
  assert.equal(translateUiText("确定删除「主 Proxy」？", "en"), "Delete “主 Proxy”?");
  assert.equal(translateUiText("已删除 主 Proxy", "en"), "Deleted 主 Proxy");
  assert.equal(
    translateUiText("导入完成：新增 2 个，更新 1 个。 请检查配置列表", "en"),
    "Import complete: 2 added, 1 updated. Review the profile list",
  );
  assert.equal(
    translateUiText("导入完成：新增 2 个，更新 1 个。 原活动配置已失效，已按你的确认自动选择第一个可用配置。 请检查配置列表", "en"),
    "Import complete: 2 added, 1 updated. The previous active profile was invalid; the first available profile was selected as confirmed. Review the profile list",
  );
  assert.equal(
    translateUiText("已验证 3 个配置。导入将按配置 ID 合并；相同 ID 的现有配置会被覆盖，其他配置保留。文件可能包含访问 Token，仅会写入本地浏览器存储。继续导入？", "en"),
    "Validated 3 profiles. Import merges by profile ID, replacing matching profiles and keeping the others. The file may contain access tokens and will only be stored locally in this browser. Continue?",
  );
});


test("translates the custom background file picker and its helper text", () => {
  const cases = [
    ["或上传本地图片", "Or upload a local image"],
    ["选择文件", "Choose file"],
    ["未选择任何文件", "No file selected"],
    ["选择背景图片文件", "Choose a background image file"],
    ["支持 PNG、JPG、WebP，原图最大 10 MB；上传后会自动缩放压缩并存储在当前浏览器 localStorage，不会上传到服务器。", "PNG, JPG, and WebP images. Maximum source file size: 10 MB. Images are automatically resized and compressed, then stored in this browser's localStorage. Files are never uploaded to the server."],
    ["请选择 PNG、JPG 或 WebP 图片", "Choose a PNG, JPG, or WebP image."],
    ["原始图片不能超过 10 MB", "The original image must not exceed 10 MB."],
    ["当前浏览器不支持本地图片处理，请改用 HTTPS 图片链接", "This browser does not support local image processing. Use an HTTPS image URL instead."],
  ];
  for (const [source, expected] of cases) {
    assert.equal(translateUiText(source, "en"), expected, source);
  }
});


test("localizes background image picker updates after user interaction", () => {
  const cases = [
    ["未选择任何文件", "No file selected"],
    ["已选择本地图片；保存后会保留在此浏览器。", "Local image selected; it will remain in this browser after saving."],
    ["已填写图片链接；保存后应用。", "Image URL entered; it will be applied after saving."],
    ["将恢复默认渐变背景；保存后生效。", "The default gradient background will be restored after saving."],
    ["图片已处理；点击“保存并切换”后应用", "Image processed; click Save and switch to apply it."],
    ["处理图片失败，请重试", "Image processing failed. Try again."],
  ];
  for (const [source, expected] of cases) {
    assert.equal(translateUiText(source, "en"), expected, source);
  }
});

test("preserves profile names containing punctuation in dynamic translations", () => {
  const profileNames = [
    "Worker-01",
    "GPU「west」」？backup",
    "rig.*$[east]",
    "trailing 」？",
  ];
  for (const profileName of profileNames) {
    assert.equal(
      translateUiText(`确定删除「${profileName}」？`, "en"),
      `Delete “${profileName}”?`,
    );
    assert.equal(translateUiText(`删除 ${profileName}`, "en"), `Delete ${profileName}`);
    assert.equal(translateUiText(`已删除 ${profileName}`, "en"), `Deleted ${profileName}`);
  }
});


test("localized dynamic text retains its source when switching languages", () => {
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  const previousNodeFilter = globalThis.NodeFilter;
  const textNode = { nodeType: 3, nodeValue: "", parentElement: null };
  const element = {
    nodeType: 1,
    firstChild: null,
    closest: () => null,
    getAttribute: () => null,
    set textContent(value) {
      textNode.nodeValue = value;
      textNode.parentElement = this;
      this.firstChild = textNode;
    },
    get textContent() {
      return this.firstChild?.nodeValue ?? "";
    },
  };
  const body = { nodeType: 1, getAttribute: () => null, querySelectorAll: () => [] };
  globalThis.document = {
    title: "",
    documentElement: { dataset: {} },
    body,
    getElementById: () => null,
    createTreeWalker(root) {
      let visited = false;
      return {
        nextNode() {
          if (root === body && element.firstChild && !visited) {
            visited = true;
            return textNode;
          }
          return null;
        },
      };
    },
  };
  globalThis.Node = { ELEMENT_NODE: 1 };
  globalThis.NodeFilter = { SHOW_TEXT: 4 };

  try {
    applyLocale("en");
    setLocalizedText(element, "未选择任何文件");
    assert.equal(element.textContent, "No file selected");
    applyLocale("zh-CN");
    assert.equal(element.textContent, "未选择任何文件");
    applyLocale("en");
    assert.equal(element.textContent, "No file selected");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousNodeFilter === undefined) delete globalThis.NodeFilter;
    else globalThis.NodeFilter = previousNodeFilter;
    applyLocale("zh-CN");
  }
});
