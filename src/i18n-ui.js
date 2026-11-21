import { getLocale, saveLocale } from "./i18n.js";

const ZH_TO_EN = Object.freeze({
  "XMRig Proxy 仪表盘": "XMRig Proxy Dashboard",
  "语言": "Language",
  "简体中文": "Simplified Chinese",
  "加载中…": "Loading…",
  "只读视图": "Read-only view",
  "初始化…": "Initializing…",
  "最后更新:": "Last updated:",
  "仪表盘操作": "Dashboard actions",
  "设置": "Settings",
  "⚙ 设置": "⚙ Settings",
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
  "删除": "Delete",
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
  "选择文件": "Choose file",
  "未选择任何文件": "No file selected",
  "选择背景图片文件": "Choose a background image file",
  "支持 PNG、JPG、WebP，原图最大 10 MB；上传后会自动缩放压缩并存储在当前浏览器 localStorage，不会上传到服务器。": "PNG, JPG, and WebP images. Maximum source file size: 10 MB. Images are automatically resized and compressed, then stored in this browser's localStorage. Files are never uploaded to the server.",
  "背景图片预览": "Background image preview",
  "当前使用已保存的本地图片。": "Using the saved local image.",
  "当前使用已保存的图片链接。": "Using the saved image URL.",
  "未使用自定义背景。": "No custom background is in use.",
  "本地告警设置": "Local alert settings",
  "只在当前浏览器评估；不会上传 Proxy 地址、Token 或原始监控数据。": "Evaluated in this browser only; Proxy URLs, tokens, and raw monitoring data are never uploaded.",
  "最低总算力（KH/s）": "Minimum total hashrate (KH/s)",
  "低于此值时触发告警；留空表示关闭。": "Alert when hashrate falls below this value; leave blank to disable.",
  "最低活跃矿工数": "Minimum active miners",
  "低于此数量时触发告警；留空表示关闭。": "Alert when active miners fall below this count; leave blank to disable.",
  "最高拒绝份额比例（%）": "Maximum rejected-share percentage (%)",
  "高于此比例时触发告警；留空表示关闭。": "Alert when rejected shares exceed this percentage; leave blank to disable.",
  "告警冷却时间（秒）": "Alert cooldown (seconds)",
  "同一告警再次触发前的最短间隔；0 表示不等待。": "Minimum interval before the same alert can fire again; 0 disables the wait.",
  "留空表示关闭": "Leave blank to disable",
  "保存告警设置": "Save alert settings",
  "请输入有效的最低算力，且不能小于 0": "Enter a valid minimum hashrate greater than or equal to 0.",
  "最低矿工数必须是非负整数": "Minimum miner count must be a non-negative integer.",
  "拒绝份额比例必须在 0 到 100 之间": "Rejected-share percentage must be between 0 and 100.",
  "冷却时间必须是 0 到 86400 的整数秒": "Cooldown must be a whole number of seconds from 0 to 86400.",
  "请输入冷却时间；0 表示不等待": "Enter a cooldown value; use 0 for no wait.",
  "本地告警设置已保存": "Local alert settings saved.",
  "本地告警设置保存失败：浏览器存储不可用或空间不足": "Could not save local alert settings: browser storage is unavailable or full.",
  "接收浏览器通知": "Receive browser notifications",
  "当前浏览器环境不支持系统通知。": "This browser environment does not support system notifications.",
  "浏览器通知权限尚未授予；点击按钮后，浏览器会询问是否允许。": "Browser notification permission has not been granted. Click the button to ask the browser.",
  "浏览器通知已获授权。": "Browser notification permission is granted.",
  "浏览器通知已被拒绝；请在浏览器站点设置中重新允许。": "Browser notifications were denied. Allow them again in your browser's site settings.",
  "请求浏览器通知权限": "Request browser notification permission",
  "浏览器通知已启用": "Browser notifications enabled.",
  "浏览器通知已关闭": "Browser notifications disabled.",
  "无法保存通知设置：浏览器存储不可用或空间不足": "Could not save notification settings: browser storage is unavailable or full.",
  "请求通知权限失败，请重试。": "Could not request notification permission. Try again.",
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
  "导出快照": "Export snapshot",
  "导出当前监控指标为 JSON 文件": "Export current monitoring metrics as a JSON file",
  "下载当前指标快照；不包含 Proxy URL 或 Token": "Download a snapshot of current metrics; excludes the Proxy URL and token",
  "暂无可导出的监控数据，请先连接 Proxy": "No monitoring data is available to export. Connect to a Proxy first.",
  "监控快照已导出；文件不包含 Proxy URL 或 Token": "Monitoring snapshot exported; the file does not contain the Proxy URL or token",
  "导出监控快照失败，请重试": "Could not export monitoring snapshot. Try again.",
  "立即刷新": "Refresh now",
  "刷新中…": "Refreshing…",
  "立即刷新监控数据": "Refresh monitoring data now",
  "立即获取最新的 Proxy 监控数据": "Fetch the latest Proxy monitoring data now",
  "请先连接 Proxy 后再刷新": "Connect to a Proxy before refreshing",
  "请先切换到只读视图后再刷新": "Switch to read-only view before refreshing",
  "正在刷新监控数据": "Refreshing monitoring data",
  "刷新已取消": "Refresh cancelled",
  "手动刷新失败": "Manual refresh failed",
  "手动刷新失败，请检查 Proxy 连接": "Manual refresh failed. Check the Proxy connection.",
  "监控数据刷新完成": "Monitoring data refresh completed",
  "无法恢复自动刷新，请刷新页面": "Could not resume automatic refresh. Reload the page.",
  "无法初始化快照导出按钮：未找到导出操作槽位": "Could not initialize the snapshot export button: export action slot not found",
  "认证失败，请检查 Token": "Authentication failed. Check the token.",
  "检测到当前活动配置已失效。继续导入将自动选择第一个可用配置作为当前配置。是否继续？": "The active profile is no longer valid. Continuing will automatically select the first available profile. Continue?",
  "原活动配置已失效，已按你的确认自动选择第一个可用配置。": "The previous active profile was invalid; the first available profile was selected as confirmed.",
  "图片仍在处理中，请处理完成后再保存": "The image is still processing. Wait for it to finish before saving.",
  "背景图片必须是有效的 HTTPS 图片链接，或通过本地图片上传选择": "The background must use a valid HTTPS image URL or be selected through local image upload.",
  "请选择 PNG、JPG 或 WebP 图片": "Choose a PNG, JPG, or WebP image.",
  "原始图片不能超过 10 MB": "The original image must not exceed 10 MB.",
  "当前浏览器不支持本地图片处理，请改用 HTTPS 图片链接": "This browser does not support local image processing. Use an HTTPS image URL instead.",
  "图片尺寸过大，请先缩小图片后再上传": "The image dimensions are too large. Resize the image before uploading.",
  "无法处理图片，请改用 HTTPS 图片链接": "Could not process the image. Use an HTTPS image URL instead.",
  "无法处理图片，请重试": "Could not process the image. Try again.",
  "请输入配置名称": "Enter a profile name",
  "刷新间隔必须在 1-120 秒之间": "The refresh interval must be between 1 and 120 seconds",
  "配置名称和 Token 不能包含控制字符": "Profile names and tokens must not contain control characters",
  "无法读取 Proxy 配置：浏览器存储不可用，请检查存储设置后重试": "Could not read Proxy settings: browser storage is unavailable. Check storage settings and try again.",
  "该 Proxy 配置已不存在，请刷新配置列表后重试": "This Proxy profile no longer exists. Refresh the profile list and try again.",
  "删除配置失败：浏览器存储不可用或空间不足，未能完成删除。请检查存储设置后重试": "Could not delete the profile because browser storage is unavailable or full. Check storage settings and try again.",
  "无法切换配置：浏览器存储不可用或空间不足，原连接状态已尽力保留": "Could not switch profiles because browser storage is unavailable or full. The previous connection state was preserved where possible.",
  "切换失败，而且浏览器存储未能完整恢复原连接状态。请清理此站点的浏览数据后重新配置": "Switching failed and browser storage could not fully restore the previous connection state. Clear this site's browsing data and configure it again.",
  "配置已删除，但无法切换当前配置：浏览器存储不可用": "The profile was deleted, but the active profile could not be switched because browser storage is unavailable.",
  "已登出当前连接；已保存的 Proxy 配置及其记住的凭据仍保留": "Logged out of the current connection. Saved Proxy profiles and their remembered credentials are retained.",
  "浏览器拒绝清理部分连接状态；请清理此站点的浏览数据后重试": "The browser refused to clear some connection state. Clear this site's browsing data and try again.",
  "Proxy 配置已保存，但背景设置保存失败；请检查浏览器 localStorage 空间或权限": "Proxy settings were saved, but the background setting could not be saved. Check browser localStorage space or permissions.",
  "配置保存失败：浏览器存储不可用或空间不足，请检查存储设置后重试": "Could not save the profile because browser storage is unavailable or full. Check storage settings and try again.",
  "配置保存失败，而且浏览器存储未能完整恢复之前的状态。配置或凭据可能不一致，请清理此站点的浏览数据后重新配置": "Saving failed and browser storage could not fully restore its previous state. Profiles or credentials may be inconsistent. Clear this site's browsing data and configure it again.",
  "删除失败，而且浏览器存储未能完整恢复之前的状态。配置或凭据可能不一致，请清理此站点的浏览数据后重新配置": "Deletion failed and browser storage could not fully restore its previous state. Profiles or credentials may be inconsistent. Clear this site's browsing data and configure it again.",
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
    [/^Worker: (.+) \| 版本: (.+)$/, "Worker: $1 | Version: $2"],
    [/^缓存时间: (.+)$/, "Cached at: $1"],
    [/^峰值: (.+) 矿工$/, "Peak: $1 miners"],
    [/^比率: (.+) 矿工\/上游$/, "Ratio: $1 miners/upstream"],
    [/^最近 (\d+) 次成功刷新的算力趋势$/, "Hashrate trend from the last $1 successful refreshes"],
    [/^连接失败: (.+)$/, "Connection failed: $1"],
    [/^刷新失败: (.+)$/, "Refresh failed: $1"],
    [/^正在连接 (.+)\.\.\.$/, "Connecting to $1…"],
    [/^已切换到 (.+)$/, "Switched to $1"],
    [/^导入完成：新增 (\d+) 个，更新 (\d+) 个。 原活动配置已失效，已按你的确认自动选择第一个可用配置。 请检查配置列表$/, "Import complete: $1 added, $2 updated. The previous active profile was invalid; the first available profile was selected as confirmed. Review the profile list"],
    [/^导入完成：新增 (\d+) 个，更新 (\d+) 个。 请检查配置列表$/, "Import complete: $1 added, $2 updated. Review the profile list"],
    [/^配置已保存，但切换连接失败: (.+)$/, "Settings were saved, but switching the connection failed: $1"],
    [/^已验证 (\d+) 个配置。导入将按配置 ID 合并；相同 ID 的现有配置会被覆盖，其他配置保留。文件可能包含访问 Token，仅会写入本地浏览器存储。继续导入？$/, "Validated $1 profiles. Import merges by profile ID, replacing matching profiles and keeping the others. The file may contain access tokens and will only be stored locally in this browser. Continue?"],
  ];
  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? "";
  const content = value.slice(leadingWhitespace.length, value.length - trailingWhitespace.length);
  for (const [pattern, replacement] of dynamicPatterns) {
    if (pattern.test(content)) {
      return leadingWhitespace + content.replace(pattern, replacement) + trailingWhitespace;
    }
  }

  // Profile names are user-controlled and may contain the punctuation used
  // around them in Chinese prompts. Match only the fixed prefix/suffix and
  // slice the value between them instead of parsing it with a regular
  // expression. This preserves names containing 」, ？, regex metacharacters,
  // or other punctuation without interpreting them as pattern syntax.
  const dynamicAffixes = [
    ["确定删除「", "」？", profileName => `Delete “${profileName}”?`],
    ["已删除 ", "", profileName => `Deleted ${profileName}`],
    ["删除 ", "", profileName => `Delete ${profileName}`],
  ];
  for (const [prefix, suffix, format] of dynamicAffixes) {
    if (
      content.startsWith(prefix)
      && content.endsWith(suffix)
      && content.length > prefix.length + suffix.length
    ) {
      const profileName = content.slice(prefix.length, content.length - suffix.length);
      return leadingWhitespace + format(profileName) + trailingWhitespace;
    }
  }

  const translated = ZH_TO_EN[trimmed];
  return translated === undefined ? value : leadingWhitespace + translated + trailingWhitespace;
}

/** Set interface text immediately while retaining its source for locale changes. */
export function setLocalizedText(element, sourceText) {
  if (!element || typeof sourceText !== "string") return;
  element.textContent = sourceText;
  const node = element.firstChild;
  if (!node || node.nodeType !== 3) return;

  const translated = translateUiText(sourceText, activeLocale);
  textOriginals.set(node, sourceText);
  textRendered.set(node, translated);
  if (translated !== node.nodeValue) node.nodeValue = translated;
}

function translateTextNode(node) {
  // Profile names and URLs are user data, not interface copy.
  if (node.parentElement?.closest(".profile-name, .profile-url, [data-user-content]")) return;
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
  document.title = translateUiText("XMRig Proxy 仪表盘", activeLocale);
  const selector = document.getElementById("localeSelector");
  if (selector) selector.value = activeLocale;
  translateSubtree(document.body);
  document.documentElement.dataset.localeReady = "true";
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
  // Modals and toast notifications are appended directly to body, outside
  // .container, so body remains the smallest complete observation root.
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "placeholder", "title", "alt"],
  });
  window.addEventListener("pagehide", () => {
    observer?.disconnect();
    observer = null;
  }, { once: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLocaleUi, { once: true });
  } else {
    initializeLocaleUi();
  }
}
