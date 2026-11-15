import { getLocale, saveLocale } from "./i18n.js";

const ZH_TO_EN = Object.freeze({
  "加载中…": "Loading…",
  "只读视图": "Read-only view",
  "初始化…": "Initializing…",
  "最后更新:": "Last updated:",
  "仪表盘操作": "Dashboard actions",
  "设置": "Settings",
  "正在初始化…": "Initializing…",
  "只读监控面板": "Read-only monitoring dashboard",
  "连接 XMRig Proxy": "Connect to XMRig Proxy",
  "· 只读": "· Read-only",
  "留空表示无需 Token": "Leave blank if no token is required",
  "记住我 (localStorage)": "Remember me (localStorage)",
  "连接": "Connect",
  "本面板为只读视图 — Proxy 配置请直接在服务端修改": "This dashboard is read-only — edit Proxy configuration on the server",
  "(HTTP API 受": "(HTTP API is controlled by",
  "控制)": ")",
  "所有数据仅保存在浏览器本地，部署服务器无法访问。": "All data stays in this browser; the hosting server cannot access it.",
  "Token 不能包含控制字符": "Token must not contain control characters",
  "请输入 API URL": "Enter an API URL",
  "连接中...": "Connecting…",
  "连接成功": "Connected successfully",
  "认证失败：Token 无效或已过期": "Authentication failed: token is invalid or expired",
  "连接超时，请检查地址和网络": "Connection timed out. Check the URL and network.",
  "连接失败": "Connection failed",
  "等待有效的算力采样…": "Waiting for valid hashrate samples…",
  "较早": "Older",
  "最近": "Latest",
  "正在加载本地图表库…": "Loading local chart library…",
  "至少需要两次成功刷新才能绘制交互式趋势图。": "At least two successful refreshes are required to draw the interactive trend chart.",
  "uPlot 交互式趋势图已启用；悬停可查看数据。": "Interactive uPlot chart enabled; hover to inspect data.",
  "重试交互式图表": "Retry interactive chart",
  "增强图表加载失败，已恢复轻量图表。": "Enhanced chart failed to load; reverted to the lightweight chart.",
  "交互式图表加载失败，默认图表仍可使用": "Interactive chart failed to load; the default chart is still available",
  "切换到轻量图表": "Switch to lightweight chart",
  "启用交互式图表": "Enable interactive chart",
  "当前使用轻量 SVG 图表。": "Using the lightweight SVG chart.",
  "离线缓存": "Offline cache",
  "未知": "Unknown",
  "10秒": "10 seconds",
  "1分钟": "1 minute",
  "15分钟": "15 minutes",
  "1小时": "1 hour",
  "12小时": "12 hours",
  "24小时": "24 hours",
  "当前算力": "Current hashrate",
  "10秒平均": "10-second average",
  "活跃矿工": "Active miners",
  "矿工": "miners",
  "连接工人": "Connected workers",
  "运行时间": "Uptime",
  "自上次重启": "Since last restart",
  "会话算力趋势": "Session hashrate trend",
  "最近 30 次成功刷新 · 切换配置或重新连接后重置 · 仅保留在当前页面会话": "Last 30 successful refreshes · resets on profile switch or reconnect · stored only for this page session",
  "算力表现": "Hashrate performance",
  "10 秒": "10 seconds",
  "1 分钟": "1 minute",
  "15 分钟": "15 minutes",
  "1 小时": "1 hour",
  "12 小时": "12 hours",
  "24 小时": "24 hours",
  "系统资源": "System resources",
  "内存使用": "Memory usage",
  "RSS 内存": "RSS memory",
  "负载均值": "Load average",
  "CPU 核心": "CPU cores",
  "上游矿池": "Upstream pools",
  "活跃": "Active",
  "休眠": "Idle",
  "错误": "Errors",
  "总计": "Total",
  "平均矿工/池": "Average miners/pool",
  "挖矿结果": "Mining results",
  "已接受": "Accepted",
  "已拒绝": "Rejected",
  "无效": "Invalid",
  "过期": "Stale",
  "接受率": "Acceptance rate",
  "延迟": "Latency",
  "总哈希数": "Total hashes",
  "平均提交时间": "Average submit time",
  "Proxy 配置": "Proxy settings",
  "关闭": "Close",
  "已保存的 Proxy": "Saved Proxies",
  "+ 新建 Proxy": "+ Add Proxy",
  "导出配置": "Export settings",
  "导入配置": "Import settings",
  "选择要导入的 Proxy 配置 JSON 文件": "Choose a Proxy settings JSON file to import",
  "导出文件可能包含访问 Token；请妥善保管。导入会合并配置，同 ID 项目将被覆盖。文件只在本机处理，不会上传。": "Exported files may contain access tokens; keep them secure. Import merges profiles and replaces matching IDs. Files are processed locally and never uploaded.",
  "暂无保存的 Proxy 配置": "No saved Proxy profiles",
  "编辑配置": "Edit profile",
  "新建配置": "New profile",
  "当前使用": "Active",
  "配置名称": "Profile name",
  "例如：主 Proxy": "e.g. Main Proxy",
  "自动刷新间隔 (秒)": "Auto-refresh interval (seconds)",
  "最小 1 秒，最大 120 秒": "Minimum 1 second; maximum 120 seconds",
  "外观主题": "Appearance",
  "跟随系统": "System",
  "深色模式": "Dark mode",
  "浅色模式": "Light mode",
  "选择“跟随系统”后，面板会随设备的明暗外观自动切换。": "When set to System, the dashboard follows your device's light/dark appearance.",
  "背景图片链接（可选）": "Background image URL (optional)",
  "或上传本地图片": "Or upload a local image",
  "支持 PNG、JPG、WebP，原图最大 10 MB；上传后会自动缩放压缩并存储在当前浏览器 localStorage，不会上传到服务器。": "PNG, JPG and WebP supported; 10 MB source limit. Images are resized, compressed and stored in this browser's localStorage, never uploaded.",
  "背景图片预览": "Background image preview",
  "当前使用已保存的本地图片。": "Using the saved local image.",
  "当前使用已保存的图片链接。": "Using the saved image URL.",
  "未使用自定义背景。": "No custom background is in use.",
  "恢复默认背景": "Restore default background",
  "取消": "Cancel",
  "登出": "Log out",
  "保存并切换": "Save and switch",
  "选择备份内容": "Choose backup contents",
  "请选择是否把 Proxy 访问 Token 一并写入备份文件。文件只会在本机生成并下载，不会上传。": "Choose whether to include Proxy access tokens in the backup. The file is generated and downloaded locally; nothing is uploaded.",
  "完整备份（包含 Token）": "Full backup (include tokens)",
  "脱敏备份（不包含 Token）": "Redacted backup (exclude tokens)",
  "完整备份可直接迁移连接凭据；脱敏备份会把所有 Token 留空，导入后需要重新填写。": "A full backup transfers credentials. A redacted backup leaves tokens blank; enter them again after importing.",
  "导出文件超过 1 MB 限制，请减少配置数量或 Token 长度后重试": "Export exceeds the 1 MB limit. Reduce the number of profiles or token lengths and try again.",
  "完整配置已导出。文件包含访问 Token，请妥善保管": "Full settings exported. The file contains access tokens; keep it secure.",
  "脱敏配置已导出。所有访问 Token 均已从备份中移除": "Redacted settings exported. All access tokens were removed.",
  "导出配置失败，请检查浏览器存储": "Could not export settings. Check browser storage.",
  "导入文件超过 1 MB 限制": "Import file exceeds the 1 MB limit.",
  "已验证": "Validated",
  "请检查配置列表": "Review the profile list",
  "导入失败：文件无效或浏览器存储不可用": "Import failed: invalid file or browser storage unavailable",
  "已选择本地图片；保存后会保留在此浏览器。": "Local image selected; it will remain in this browser after saving.",
  "已填写图片链接；保存后应用。": "Image URL entered; it will be applied after saving.",
  "将恢复默认渐变背景；保存后生效。": "The default gradient background will be restored after saving.",
  "图片已处理；点击“保存并切换”后应用": "Image processed; click Save and switch to apply it.",
  "处理图片失败，请重试": "Image processing failed. Try again.",
  "当前已在使用该 Proxy 配置": "This Proxy profile is already active.",
  "至少保留一个 Proxy 配置": "At least one Proxy profile must be kept.",
  "无效的 URL": "Invalid URL",
  "保存中...": "Saving…",
  "会话过期，请重新登录": "Session expired. Please reconnect.",
  "预警": "Warning",
  "在线": "Online",
  "离线": "Offline",
  "等待中": "Waiting",
});

const textOriginals = new WeakMap();
const textRendered = new WeakMap();
const attributeOriginals = new WeakMap();
const attributeRendered = new WeakMap();
let activeLocale = getLocale();
let observer = null;
let applying = false;

export function translateUiText(value, locale = activeLocale) {
  if (typeof value !== "string" || locale !== "en") return value;
  const trimmed = value.trim();
  const dynamicPatterns = [
    [/^Worker: (.+) \\| 版本: (.+)$/, "Worker: $1 | Version: $2"],
    [/^缓存时间: (.+)$/, "Cached at: $1"],
    [/^峰值: (.+) 矿工$/, "Peak: $1 miners"],
    [/^比率: (.+) 矿工\\/上游$/, "Ratio: $1 miners/upstream"],
    [/^最近 (\\d+) 次成功刷新的算力趋势$/, "Hashrate trend from the last $1 successful refreshes"],
    [/^连接失败: (.+)$/, "Connection failed: $1"],
    [/^刷新失败: (.+)$/, "Refresh failed: $1"],
    [/^正在连接 (.+)\\.\\.\\.$/, "Connecting to $1…"],
    [/^已切换到 (.+)$/, "Switched to $1"],
    [/^导入完成：新增 (\\d+) 个，更新 (\\d+) 个。$/, "Import complete: $1 added, $2 updated."],
  ];
  for (const [pattern, replacement] of dynamicPatterns) {
    if (pattern.test(trimmed)) return value.replace(trimmed, trimmed.replace(pattern, replacement));
  }
  const translated = ZH_TO_EN[trimmed];
  return translated === undefined ? value : value.replace(trimmed, translated);
}

function translateTextNode(node) {
  const current = node.nodeValue;
  const previousRendered = textRendered.get(node);
  const original = previousRendered === current ? textOriginals.get(node) : current;
  if (typeof original !== "string") return;
  textOriginals.set(node, original);
  const next = translateUiText(original, activeLocale);
  textRendered.set(node, next);
  if (next !== current) node.nodeValue = next;
}

function translateAttribute(element, name) {
  const current = element.getAttribute(name);
  if (current === null) return;
  let originals = attributeOriginals.get(element);
  let rendered = attributeRendered.get(element);
  if (!originals) {
    originals = new Map();
    rendered = new Map();
    attributeOriginals.set(element, originals);
    attributeRendered.set(element, rendered);
  }
  const original = rendered.get(name) === current ? originals.get(name) : current;
  originals.set(name, original);
  const next = translateUiText(original, activeLocale);
  rendered.set(name, next);
  if (next !== current) element.setAttribute(name, next);
}

function translateSubtree(root) {
  if (!root || applying) return;
  applying = true;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) translateTextNode(node);
    if (root.nodeType === Node.ELEMENT_NODE) {
      for (const name of ["aria-label", "placeholder", "title", "alt"]) {
        translateAttribute(root, name);
      }
      root.querySelectorAll?.("[aria-label], [placeholder], [title], [alt]").forEach(element => {
        for (const name of ["aria-label", "placeholder", "title", "alt"]) {
          translateAttribute(element, name);
        }
      });
    }
  } finally {
    applying = false;
  }
}

export function applyLocale(locale = getLocale()) {
  activeLocale = locale === "en" ? "en" : "zh-CN";
  if (typeof document === "undefined") return activeLocale;
  document.documentElement.lang = activeLocale;
  document.title = "XMRig Proxy Dashboard";
  const selector = document.getElementById("localeSelector");
  if (selector) selector.value = activeLocale;
  translateSubtree(document.body);
  return activeLocale;
}

function initializeLocaleUi() {
  const selector = document.getElementById("localeSelector");
  if (selector) {
    selector.value = activeLocale;
    selector.addEventListener("change", () => {
      const next = selector.value === "en" ? "en" : "zh-CN";
      saveLocale(next);
      applyLocale(next);
    });
  }
  applyLocale(activeLocale);
  observer = new MutationObserver(records => {
    if (applying) return;
    for (const record of records) {
      if (record.type === "characterData") translateTextNode(record.target);
      else {
        record.addedNodes?.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateSubtree(node);
        });
        if (record.type === "attributes") translateAttribute(record.target, record.attributeName);
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "placeholder", "title", "alt"],
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLocaleUi, { once: true });
  } else {
    initializeLocaleUi();
  }
}
