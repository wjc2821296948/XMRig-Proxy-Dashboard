/**
 * main.js – Application bootstrap and core logic.
 *
 * Responsibilities:
 *  1. Load saved configuration (API URL + Token) from storage.
 *  2. If missing → show connection form.
 *  3. If present → fetch data and render dashboard.
 *  4. Set up auto-refresh interval (10s).
 *  5. Wire UI events: Settings, Logout, Connect form.
 */

import { request, probeWriteAccess } from "./api.js";
import { registerVisibilityRefresh } from "./visibility-refresh.js";
import {
  loadConfig, clearConfig, getConfig, consumeConfigCleanupWarning, consumeStorageRecoveryWarning,
  loadProfiles, getProfileById, saveProfile, deleteProfile, setActiveProfile,
  createProfilesExport, parseProfilesImportJson, importProfiles,
  loadActiveProfileId, getActiveProfile,
  loadTheme, saveTheme,
  saveWriteAccess, loadWriteAccess, clearWriteAccess,
} from "./storage.js";
import {
  showToast,
  renderSkeleton,
  formatHashrate,
  formatBytes,
  formatUptime,
  formatNumber,
} from "./ui.js";
import {
  createStatusTracker,
  resetStatusTracker,
  getStatusInfo,
} from "./status.js";
import { escapeHtml } from "./escape-html.js";

function clearConfigWithWarning({ showWarning = true } = {}) {
  const cleared = clearConfig();
  if (!cleared && showWarning) {
    showToast("浏览器拒绝清理部分连接状态；请清理此站点的浏览数据后重试", "error");
  }
  return cleared;
}

function storageFailureMessage(defaultMessage, rollbackFailureMessage) {
  return consumeStorageRecoveryWarning() ? rollbackFailureMessage : defaultMessage;
}

// Global state
let refreshInterval = null;
let fetchAbortController = null;
let cleanupVisibilityRefresh = null;
let connectPending = false;
const statusTracker = createStatusTracker();


/** Return a localized validation reason for a Proxy API URL, or null when valid. */
function getApiUrlValidationError(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "invalid";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "protocol";
  if (parsed.username || parsed.password) return "credentials";
  return null;
}

function showApiUrlValidationError(reason, invalidMessage = "无效的 URL 格式") {
  const messages = {
    invalid: invalidMessage,
    protocol: "API URL 必须使用 HTTP 或 HTTPS",
    credentials: "请勿在 API URL 中填写用户名或密码",
  };
  showToast(messages[reason] || invalidMessage, "error");
}

/* ==========================================================================
   Theme Management
   The theme is owned by storage.js — never read or write localStorage
   directly here.
   ========================================================================== */
let systemThemeMediaQuery = null;
let systemThemeChangeHandler = null;

function resolveThemePreference(preference) {
  if (preference !== "system") return preference === "light" ? "light" : "dark";
  if (typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyResolvedTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  syncViewModeBadgeText(theme);
  // The mode picker has theme-dependent copy; close it rather than leave
  // stale language/labels visible when the OS changes appearance.
  modePickerTheme = null;
  if (modePickerEl?.classList.contains("open")) closeModePicker();
}

function syncSystemThemeListener(preference) {
  if (systemThemeMediaQuery && systemThemeChangeHandler) {
    try {
      if (typeof systemThemeMediaQuery.removeEventListener === "function") {
        systemThemeMediaQuery.removeEventListener("change", systemThemeChangeHandler);
      } else if (typeof systemThemeMediaQuery.removeListener === "function") {
        systemThemeMediaQuery.removeListener(systemThemeChangeHandler);
      }
    } catch {
      // A stale listener may be impossible to detach in a non-standard
      // MediaQueryList implementation; its identity guard below makes it inert.
    }
  }
  systemThemeMediaQuery = null;
  systemThemeChangeHandler = null;
  if (preference !== "system" || typeof window.matchMedia !== "function") return;

  const query = window.matchMedia("(prefers-color-scheme: light)");
  const handler = event => {
    // Ignore callbacks from a previous preference/listener if cleanup failed.
    if (systemThemeMediaQuery !== query || systemThemeChangeHandler !== handler) return;
    applyResolvedTheme(event.matches ? "light" : "dark");
  };
  systemThemeMediaQuery = query;
  systemThemeChangeHandler = handler;
  if (typeof query.addEventListener === "function") query.addEventListener("change", handler);
  else if (typeof query.addListener === "function") query.addListener(handler);
}

function applyThemePreference(preference, { persist = false } = {}) {
  const themePreference = ["dark", "light", "system"].includes(preference) ? preference : "dark";
  if (persist && !saveTheme(themePreference)) {
    showToast("主题已切换，但浏览器存储不可用，刷新后不会保留该设置", "warning");
  }
  applyResolvedTheme(resolveThemePreference(themePreference));
  syncSystemThemeListener(themePreference);
  return themePreference;
}

function initTheme() {
  applyThemePreference(loadTheme());
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  applyThemePreference(newTheme, { persist: true });
  showToast(`已切换到${newTheme === "dark" ? "深色" : "浅色"}模式`, "info");
}

/**
 * Update the persistent "view-only" ribbon's text to match the active theme.
 * Kept as a single helper so both `initTheme`, `toggleTheme`, and the
 * settings-modal save branch call the same source of truth.
 *
 * @param {"dark"|"light"} theme
 */
function syncViewModeBadgeText(_theme) {
  const label = document.getElementById("viewModeBadgeText");
  if (!label) return;
  label.textContent = "只读视图";
}

/**
 * Re-tint the header ribbon to reflect the current login state:
 *   - "connected" (green dot)   — a connection succeeded and we are live.
 *   - "disconnected" (yellow)   — no config saved, or the operator logged out.
 * The status badge stays responsible for miner health (online/warning/offline);
 * the ribbon only answers "is the panel actually talking to *something*?"
 *
 * @param {"connected"|"disconnected"} state
 */
function setRibbonConnectState(state) {
  const badge = document.getElementById("viewModeBadge");
  if (!badge) return;
  badge.dataset.connectState = state;
  // Repaint the open picker in lockstep so the dots and active marker
  // never sit on a stale color if the connection flips while the
  // picker is showing.
  syncModePickerConnectState();
}

/**
 * Centralised disconnect sequence. Three callers used to repeat this
 * pattern (logout, auth failure in fetchAndRender, auth failure in
 * settings-save). Keeping it here makes the policy a single line —
 * e.g. the decision to keep or clear the write-access flag is now
 * documented in one place instead of scattered across the file.
 *
 * @param {{clearWriteAccess?: boolean}} [opts] When true, also clears the
 *                                          persisted write-access flag.
 *                                          Defaults to false (keep the
 *                                          previously-probed state across
 *                                          transient disconnects).
 */
function markDisconnected({ clearWriteAccess: shouldClear = false } = {}) {
  if (shouldClear && !clearWriteAccess()) {
    showToast("无法保存写入权限状态：浏览器存储不可用", "warn");
  }
  setRibbonConnectState("disconnected");
  // Only repaint the alt row when the persisted flag actually changed;
  // a transient disconnect (network blip) should not reflash the picker.
  if (shouldClear) syncModePickerAltRow();
}

/**
 * Apply a tri-state probe result. Persists the flag for the picker and
 * surfaces non-restricted failures so the operator gets a real reason
 * instead of a silent downgrade to "disabled".
 *
 * @param {"unrestricted" | "restricted" | "unknown"} state
 * @param {boolean} [showUnknownToast] When true, an "unknown" result also
 *                                     fires a toast. False suppresses it
 *                                     (e.g. when the caller already showed
 *                                     a connection-level error toast).
 */
function applyProbeResult(state, showUnknownToast = true) {
  if (!saveWriteAccess(state === "unrestricted")) {
    showToast("无法保存 Proxy 权限状态：浏览器存储不可用，刷新后可能需要重新检测", "warn");
  }
  if (state === "unknown" && showUnknownToast) {
    showToast("无法确认 Proxy 写入权限，配置模式已禁用（请检查网络或 CORS）", "warn");
  }
}

/* ==========================================================================
   DOM Element References (cached)
   ========================================================================== */
const els = {
  dashboard: document.getElementById("dashboard"),
  statusBadge: document.getElementById("statusBadge"),
  workerId: document.getElementById("workerId"),
  lastUpdate: document.getElementById("lastUpdate"),
  editUrl: document.getElementById("editUrl"),
  viewModeBadge: document.getElementById("viewModeBadge"),
};

/* ==========================================================================
   Mode picker (header ribbon popover)

   The ribbon advertises that it opens a menu (role="button",
   aria-haspopup="menu" in index.html). Clicking or pressing Enter/Space
   on the ribbon opens a small popover anchored to it that lists the
   currently-active mode (jade dot, not clickable) and the alternative
   mode (jade chevron when enabled, gray text + red dot when disabled).

   The alternative mode is the operator's only path to write capability,
   so it carries the most information: when the connected proxy runs
   restricted mode the alt row is locked out and its title= attribute
   tells the operator exactly which config line to flip on the server.
   ========================================================================== */

let modePickerEl = null;
let modePickerEscHandler = null;
let modePickerOutsideClickHandler = null;
let modePickerResizeHandler = null;
let modePickerResizeFrame = null;
let modePickerTheme = null;

// The dashboard currently renders in only one mode; tracking the active
// one in module-level state keeps the picker logic obvious to read.
// Stage 2 will add a 'config' branch that swaps the dashboard body.
let activeDashboardMode = "readonly";

/**
 * Open the mode picker anchored to the header ribbon.
 * Idempotent — repeated calls while it is already open are no-ops so a
 * stray re-open from the ESC handler cannot strand the popover open.
 */
function openModePicker() {
  if (modePickerEl && modePickerEl.classList.contains("open")) return;
  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
  // Rebuild the picker when the theme changed since the last build, so
  // the language and disabled-row title stay in sync without us having
  // to translate nodes in place.
  if (modePickerEl && modePickerTheme !== currentTheme) {
    modePickerEl.remove();
    modePickerEl = null;
  }
  if (!modePickerEl) {
    modePickerEl = buildModePicker();
    modePickerTheme = currentTheme;
  }
  syncModePickerAltRow();
  syncModePickerConnectState();
  positionModePicker();
  modePickerEl.classList.add("open");
  els.viewModeBadge?.setAttribute("aria-expanded", "true");

  if (!modePickerEscHandler) {
    modePickerEscHandler = e => {
      if (e.key === "Escape") closeModePicker();
    };
    document.addEventListener("keydown", modePickerEscHandler);
  }
  if (!modePickerOutsideClickHandler) {
    modePickerOutsideClickHandler = e => {
      // Defensive: a stale listener could fire after the picker node was
      // removed (e.g. during a theme-toggle rebuild). isConnected is the
      // canonical check for "still attached to the document tree".
      if (!modePickerEl || !modePickerEl.isConnected) return;
      if (modePickerEl.contains(e.target)) return;
      if (els.viewModeBadge && els.viewModeBadge.contains(e.target)) return;
      closeModePicker();
    };
    document.addEventListener("click", modePickerOutsideClickHandler);
  }
  if (!modePickerResizeHandler) {
    // Coalesce rapid resize events into one layout update per animation frame.
    modePickerResizeHandler = () => {
      if (modePickerResizeFrame !== null) return;
      modePickerResizeFrame = window.requestAnimationFrame(() => {
        modePickerResizeFrame = null;
        if (modePickerEl?.classList.contains("open")) positionModePicker();
      });
    };
    window.addEventListener("resize", modePickerResizeHandler);
  }
}

/** Close the picker and tear down its document-level listeners. */
function closeModePicker() {
  // Only touch the picker if it's still attached to the document; a
  // theme-toggle rebuild may have detached it between open and close.
  if (modePickerEl && modePickerEl.isConnected) {
    modePickerEl.classList.remove("open");
  }
  els.viewModeBadge?.setAttribute("aria-expanded", "false");
  if (modePickerEscHandler) {
    document.removeEventListener("keydown", modePickerEscHandler);
    modePickerEscHandler = null;
  }
  if (modePickerOutsideClickHandler) {
    document.removeEventListener("click", modePickerOutsideClickHandler);
    modePickerOutsideClickHandler = null;
  }
  if (modePickerResizeHandler) {
    window.removeEventListener("resize", modePickerResizeHandler);
    modePickerResizeHandler = null;
  }
  if (modePickerResizeFrame !== null) {
    window.cancelAnimationFrame(modePickerResizeFrame);
    modePickerResizeFrame = null;
  }
}

/**
 * Build the picker DOM once and re-use the node across opens. The
 * "active" and "alternative" rows are static text — only their state
 * classes flip based on the persisted write-access flag — so there is
 * nothing in the picker that needs to be re-rendered per open.
 *
 * @returns {HTMLElement}
 */
function buildModePicker() {
  const labelActive = "只读视图";
  const labelAlt    = "配置模式";
  const title       = "选择模式";

  const wrap = document.createElement("div");
  wrap.className = "mode-picker";
  wrap.setAttribute("role", "menu");
  wrap.innerHTML = `
    <div class="mode-picker-title">${escapeHtml(title)}</div>
    <div class="mode-picker-item is-active" role="menuitem" aria-disabled="true" data-mode="readonly">
      <span class="mode-picker-item-dot" aria-hidden="true"></span>
      <span class="mode-picker-item-label">${escapeHtml(labelActive)}</span>
    </div>
    <div class="mode-picker-item" role="menuitem" data-mode="config">
      <span class="mode-picker-item-dot" aria-hidden="true"></span>
      <span class="mode-picker-item-label">${escapeHtml(labelAlt)}</span>
    </div>
  `;
  document.body.appendChild(wrap);

  // Wire the alt row's behavior. The active row is intentionally
  // non-interactive (no listener) — clicking it does nothing, and the
  // cursor:default styling in CSS carries that intent.
  const altRow = wrap.querySelector('.mode-picker-item[data-mode="config"]');
  altRow.addEventListener("click", () => onAltModeRowClicked(altRow));

  return wrap;
}

/**
 * Position the picker just below the header ribbon, right-aligned.
 * getBoundingClientRect() already accounts for any page scroll, so we
 * add window scroll offsets into the fixed-position coordinates.
 */
function positionModePicker() {
  if (!modePickerEl || !els.viewModeBadge) return;
  const r = els.viewModeBadge.getBoundingClientRect();
  const margin = 8;
  const desiredLeft = window.scrollX + r.right - modePickerEl.offsetWidth;
  const minLeft = window.scrollX + margin;
  const maxLeft = Math.max(minLeft, window.scrollX + window.innerWidth - modePickerEl.offsetWidth - margin);
  modePickerEl.style.top  = `${window.scrollY + r.bottom + 6}px`;
  modePickerEl.style.left = `${Math.max(minLeft, Math.min(desiredLeft, maxLeft))}px`;
}

/**
 * Click handler for the alternative-mode row. Two outcomes:
 *  - writeAccess = true  → the row was styled .is-enabled; switch the
 *    dashboard into config mode and close the picker.
 *  - writeAccess = false → the row was styled .is-disabled; do nothing
 *    (the native title= tooltip already explains the restriction).
 */
function onAltModeRowClicked(row) {
  if (row.classList.contains("is-disabled")) return;
  closeModePicker();
  switchDashboardMode(row.dataset.mode);
}

/**
 * Re-paint the alt-mode row to reflect the most recently probed
 * write-access state. Called from openModePicker() and from any
 * connect/probe site that flips the persisted flag.
 */
function syncModePickerAltRow() {
  if (!modePickerEl) return;
  const altRow = modePickerEl.querySelector('.mode-picker-item[data-mode="config"]');
  if (!altRow) return;
  altRow.classList.remove("is-enabled", "is-disabled");
  if (loadWriteAccess()) {
    altRow.classList.add("is-enabled");
    altRow.removeAttribute("aria-disabled");
    altRow.removeAttribute("title");
  } else {
    altRow.classList.add("is-disabled");
    altRow.setAttribute("aria-disabled", "true");
    altRow.title = "本 Proxy 启用了 restricted 模式，需在 XMRig-Proxy 配置文件中将 \"restricted\" 设为 false 才能切换";
  }
}

/**
 * Mirror the ribbon's connection state onto the picker. The picker's
 * own dots, active marker, and enabled-row labels read this attribute
 * so a disconnected ribbon never sits next to a green-on-yellow
 * mismatch inside the popover.
 */
function syncModePickerConnectState() {
  if (!modePickerEl) return;
  const ribbon = els.viewModeBadge;
  const state = ribbon?.dataset?.connectState === "connected" ? "connected" : "disconnected";
  modePickerEl.dataset.state = state;
}

/**
 * Switch the dashboard body into the requested mode. For stage 1 only
 * the 'readonly' branch actually exists; 'config' is wired up to a
 * placeholder that will be replaced by the real config surface in
 * stage 2.
 *
 * @param {"readonly" | "config"} mode
 */
function switchDashboardMode(mode) {
  if (mode === activeDashboardMode) return;
  activeDashboardMode = mode;
  if (mode === "readonly") {
    // Re-render the dashboard with the last successful /1/summary payload
    // by re-fetching — keeps the chart, cards, and status all in sync
    // without us having to cache the data elsewhere.
    showToast("已切换到只读视图", "info");
    fetchAndRender().then(() => {
      if (getConfig() && activeDashboardMode === "readonly") startAutoRefresh();
    }).catch(() => {
      showToast("无法恢复只读视图，请刷新页面", "error");
    });
  } else if (mode === "config") {
    stopAutoRefresh();
    showToast("配置模式 — 占位 (即将推出)", "info");
    renderConfigPlaceholder();
  }
}

/**
 * Stage-1 placeholder for the config mode. Renders inside the same
 * dashboard container so the layout does not jump when the real config
 * UI lands in stage 2.
 */
function renderConfigPlaceholder() {
  els.dashboard.innerHTML = `
    <div class="config-panel config-mode-placeholder" role="region" aria-labelledby="config-mode-title">
      <p class="config-eyebrow">配置模式</p>
      <h2 id="config-mode-title" class="config-title">配置模式即将推出</h2>
      <p style="font-size:0.75rem;color:var(--text-secondary);text-align:center;margin-bottom:1rem;">
        将在下一阶段提供 XMRig-Proxy <code>/1/config</code> 的可视化编辑与 <code>PUT /1/config</code> 保存。
      </p>
      <div class="config-actions">
        <button class="btn btn-secondary" id="backToReadonly">返回只读视图</button>
      </div>
    </div>
  `;
  document.getElementById("backToReadonly")?.addEventListener("click", () => {
    switchDashboardMode("readonly");
  });
}

/* ==========================================================================
   Connection Form Rendering
   ========================================================================== */
function renderConnectForm(prefill = {}) {
  const { apiUrl = "", apiToken = "", remember = true } = prefill;
  els.dashboard.innerHTML = `
    <div class="config-panel" role="dialog" aria-labelledby="connect-title">
      <p class="config-eyebrow">只读监控面板</p>
      <h2 id="connect-title" class="config-title">连接 XMRig Proxy</h2>
      <div class="input-group">
        <label class="input-label" for="apiUrlInput">API URL</label>
        <input type="url" class="input-field" id="apiUrlInput" placeholder="http://your-proxy:8080/1/summary" value="${escapeHtml(apiUrl)}" required autocomplete="url">
      </div>
      <div class="input-group">
        <label class="input-label" for="apiTokenInput">Access Token <span class="input-label-suffix">· 只读</span></label>
        <input type="password" class="input-field" id="apiTokenInput" placeholder="留空表示无需 Token" value="${escapeHtml(apiToken)}" autocomplete="password">
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="rememberMe" ${remember ? "checked" : ""}>
        <label for="rememberMe">记住我 (localStorage)</label>
      </div>
      <div class="config-actions">
        <button class="btn" id="connectBtn">连接</button>
      </div>
      <p class="config-disclaimer">
        本面板为只读视图 — Proxy 配置请直接在服务端修改
        <span class="config-disclaimer-meta">(HTTP API 受 <code>restricted</code> 控制)</span>
      </p>
      <p class="config-disclaimer-sub">
        所有数据仅保存在浏览器本地，部署服务器无法访问。
      </p>
    </div>
  `;

  // Event listeners
  document.getElementById("connectBtn").addEventListener("click", handleConnect);
  document.getElementById("apiUrlInput").addEventListener("keydown", e => e.key === "Enter" && handleConnect());
  document.getElementById("apiTokenInput").addEventListener("keydown", e => e.key === "Enter" && handleConnect());
}

/* ==========================================================================
   Connect Handler
   ========================================================================== */
async function handleConnect() {
  resetStatusTracker(statusTracker);
  const url = document.getElementById("apiUrlInput").value.trim();
  const token = document.getElementById("apiTokenInput").value.trim();
  const remember = document.getElementById("rememberMe").checked;

  if (!url) {
    showToast("请输入 API URL", "error");
    return;
  }

  const urlError = getApiUrlValidationError(url);
  if (urlError) {
    showApiUrlValidationError(urlError);
    return;
  }
  if (connectPending) return;
  connectPending = true;
  const connectButton = document.getElementById("connectBtn");
  if (connectButton) {
    connectButton.disabled = true;
    connectButton.textContent = "连接中...";
  }

  try {
  // Save the connection as a profile so the current single-config flow
  // automatically participates in the multi-Proxy profile list.
  const existingProfile = getActiveProfile() || loadProfiles()[0] || null;
  const profileName = existingProfile?.name || "Proxy 1";
  const savedProfile = saveProfile({
    ...(existingProfile || {}),
    name: profileName,
    apiUrl: url,
    apiToken: token,
    remember,
    refreshInterval: existingProfile?.refreshInterval ?? 10,
  });
  if (!savedProfile) {
    showToast(storageFailureMessage(
      "浏览器存储不可用或空间不足，连接配置未保存。请检查存储设置后重试",
      "连接配置保存失败，而且浏览器存储未能完整恢复之前的状态。部分配置可能不一致，请清理此站点的浏览数据后重新配置",
    ), "error");
    return;
  }

  // Show loading skeleton
  renderSkeleton(els.dashboard, 6);
  els.statusBadge.textContent = "连接中...";
  els.statusBadge.className = "status-badge status-warning";

  try {
    // Kick off the write-access probe in parallel with the first /1/summary
    // so we don't pay an extra 8s round-trip on every connect. Both
    // requests share the same Authorization header and have independent
    // failure modes, so parallel is safe.
    const summaryPromise  = request("/1/summary");
    const probePromise    = probeWriteAccess();
    const data = await summaryPromise;
    showToast("连接成功", "success");
    renderDashboard(data);
    // The probe result is persisted so the mode picker does not need to
    // re-probe on every render, and so it survives a tab refresh. We await
    // it here only to surface non-restricted failures (network/5xx) as a
    // toast — "unknown" still disables the config-mode row but the
    // operator gets a clear reason instead of a silent downgrade.
    applyProbeResult(await probePromise, /* showUnknownToast */ true);
    setRibbonConnectState("connected");
    syncModePickerAltRow();
    startAutoRefresh();
  } catch (err) {
    // Clear invalid config on auth failure
    if (err.status === 401 || err.status === 403) {
      clearConfigWithWarning();
      resetStatusTracker(statusTracker);
      showToast("认证失败：Token 无效或已过期", "error");
    } else if (err.message.includes("timed out")) {
      showToast("连接超时，请检查地址和网络", "error");
    } else {
      showToast(`连接失败: ${err.message}`, "error");
    }
    // Probe result is only stale on auth failure — the operator's token
    // no longer matches the proxy, so any previously persisted write flag
    // belongs to a session we no longer trust. For other errors
    // (network, 5xx, timeout) we deliberately keep the old flag so a
    // transient hiccup doesn't silently downgrade the picker.
    markDisconnected({ clearWriteAccess: err.status === 401 || err.status === 403 });
    renderConnectForm({ apiUrl: url, apiToken: token, remember });
  }
  } finally {
    connectPending = false;
    const currentButton = document.getElementById("connectBtn");
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = "连接";
    }
  }
}

/* ==========================================================================
   Dashboard Rendering
   ========================================================================== */
function renderDashboard(data) {
  // Header info
  const status = getStatusInfo(data, statusTracker);
  els.statusBadge.textContent = status.text;
  els.statusBadge.className = `status-badge ${status.cls}`;
  els.workerId.textContent = `Worker: ${data.worker_id || "未知"} | 版本: ${data.version || "未知"}`;
  els.lastUpdate.textContent = new Date().toLocaleTimeString();

  // Re-sync the view-mode ribbon on every render. Defensive against any
  // race where initTheme() ran before this element existed in the DOM.
  syncViewModeBadgeText(document.documentElement.getAttribute("data-theme") || "dark");
  // A successful render is the strongest signal that we are talking to a
  // live proxy — paint the ribbon green now (handleConnect also does this,
  // but a successful auto-refresh re-confirms it for any caller that
  // reached renderDashboard through fetchAndRender).
  setRibbonConnectState("connected");

  // Hashrate data
  const rawHashrates = data.hashrate?.total;
  const hashrates = Array.isArray(rawHashrates) && rawHashrates.length
    ? rawHashrates.map(value => Number.isFinite(value) && value >= 0 ? value : 0)
    : [0,0,0,0,0,0];
  // Use a positive floor so an all-zero series never produces NaN coordinates.
  const maxHr = Math.max(...hashrates, 1);
  const timeLabels = ["10秒", "1分钟", "15分钟", "1小时", "12小时", "24小时"];

  // Color palette for different time periods — pulled from CSS variables
  // so light theme and any future theme can override them in one place.
  const chartColors = [
    "var(--chart-blue)",
    "var(--chart-purple)",
    "var(--chart-cyan)",
    "var(--chart-green)",
    "var(--chart-yellow)",
    "var(--chart-red)",
  ];

  // Line chart data points for SVG
  const chartVPWidth = 1000;
  const chartVPHeight = 200;
  const padding = 50;
  const points = hashrates.map((h, i) => {
    const x = hashrates.length <= 1 ? chartVPWidth / 2 : padding + (i / (hashrates.length - 1)) * (chartVPWidth - 2 * padding);
    const y = chartVPHeight - padding - ((h / maxHr) * (chartVPHeight - 2 * padding));
    return { x, y, value: formatHashrate(h), label: timeLabels[i], color: chartColors[i] };
  });
  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const lineChart = `
    <svg class="hashrate-line-chart" viewBox="0 0 ${chartVPWidth} ${chartVPHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="hrGradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="var(--accent-copper-deep)" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="var(--accent-copper)" stop-opacity="0.85"/>
        </linearGradient>
        ${points.map((p, i) => `
          <linearGradient id="pointGradient${i}" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="${p.color}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${p.color}" stop-opacity="0.8"/>
          </linearGradient>
        `).join('')}
      </defs>
      <!-- Grid lines -->
      <g class="chart-grid" stroke="var(--border-light)" stroke-width="0.5">
        <line x1="${padding}" y1="${padding}" x2="${chartVPWidth - padding}" y2="${padding}"/>
        <line x1="${padding}" y1="${chartVPHeight / 2}" x2="${chartVPWidth - padding}" y2="${chartVPHeight / 2}"/>
        <line x1="${padding}" y1="${chartVPHeight - padding}" x2="${chartVPWidth - padding}" y2="${chartVPHeight - padding}"/>
      </g>
      <!-- Area under curve -->
      <path d="${pathData} L ${chartVPWidth - padding} ${chartVPHeight - padding} L ${padding} ${chartVPHeight - padding} Z"
            fill="url(#hrGradient)" stroke="none"/>
      <!-- Line segments with different colors -->
      ${points.slice(1).map((p, i) => `
        <path d="M ${points[i].x} ${points[i].y} L ${p.x} ${p.y}" stroke="${p.color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      `).join('')}
      <!-- Data points with individual colors -->
      ${points.map((p, i) => `
        <circle class="chart-point" cx="${p.x}" cy="${p.y}" r="6"
                fill="${p.color}" stroke="var(--bg-card)" stroke-width="2"
                data-label="${escapeHtml(p.label)}" data-value="${escapeHtml(p.value)}" />
      `).join('')}
      <!-- X-axis labels -->
      ${points.map(p => `
        <text x="${p.x}" y="${chartVPHeight - 4}" text-anchor="middle"
              font-size="0.7rem" fill="var(--text-muted)" class="chart-label">${escapeHtml(p.label)}</text>
      `).join('')}
    </svg>
  `;

  // Memory usage
  // Precedence-safe: clamp the difference to >= 0 because malformed or
  // transient readings where `total < free` would otherwise leak a
  // negative number (or NaN) into the UI.
  const memTotal = data.resources?.memory?.total ?? 0;
  const memFree  = data.resources?.memory?.free  ?? memTotal;
  const memUsed  = Math.max(0, memTotal - memFree);
  const memPct   = memTotal > 0 ? ((memUsed / memTotal) * 100).toFixed(1) : "0.0";

  // Acceptance rate
  const accepted = data.results?.accepted || 0;
  const rejected = data.results?.rejected || 0;
  const totalShares = accepted + rejected;
  const acceptance = totalShares ? ((accepted / totalShares) * 100).toFixed(2) : "0.00";

  // Upstream ratio
  const rawUpstreamRatio = data.upstreams?.ratio;
  const upstreamRatio = Number.isFinite(rawUpstreamRatio) && rawUpstreamRatio >= 0
    ? rawUpstreamRatio.toFixed(1)
    : "0.0";

  // Build HTML
  const html = `
    <div class="grid">
      <div class="card">
        <div class="card-title">当前算力</div>
        <div class="card-value highlight-green">${formatHashrate(hashrates[0])}</div>
        <div class="card-label">10秒平均</div>
        <div class="hashrate-chart">${lineChart}</div>
      </div>

      <div class="card">
        <div class="card-title">活跃矿工</div>
        <div class="card-value ${data.miners?.now > 0 ? "highlight-green" : "highlight-red"}">${formatNumber(data.miners?.now || 0)}</div>
        <div class="card-label">峰值: ${formatNumber(data.miners?.max || 0)} 矿工</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${(data.miners?.max ? Math.min(100, Math.max(0, (data.miners.now || 0) / data.miners.max * 100)) : 0).toFixed(1)}%"></div></div>
      </div>

      <div class="card">
        <div class="card-title">连接工人</div>
        <div class="card-value highlight-blue">${data.workers || 0}</div>
        <div class="card-label">比率: ${upstreamRatio} 矿工/上游</div>
      </div>

      <div class="card">
        <div class="card-title">运行时间</div>
        <div class="card-value">${formatUptime(data.uptime || 0)}</div>
        <div class="card-label">自上次重启</div>
      </div>
    </div>

    <div class="grid">
      <div class="card large-card">
        <div class="card-title">算力表现</div>
        <div class="metrics-grid">
          <div class="metric-item"><div class="metric-value highlight-green">${formatHashrate(hashrates[0])}</div><div class="metric-label">10 秒</div></div>
          <div class="metric-item"><div class="metric-value">${formatHashrate(hashrates[1])}</div><div class="metric-label">1 分钟</div></div>
          <div class="metric-item"><div class="metric-value">${formatHashrate(hashrates[2])}</div><div class="metric-label">15 分钟</div></div>
          <div class="metric-item"><div class="metric-value">${formatHashrate(hashrates[3])}</div><div class="metric-label">1 小时</div></div>
          <div class="metric-item"><div class="metric-value">${formatHashrate(hashrates[4])}</div><div class="metric-label">12 小时</div></div>
          <div class="metric-item"><div class="metric-value">${formatHashrate(hashrates[5])}</div><div class="metric-label">24 小时</div></div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">系统资源</div>
        <div class="stat-row"><span class="stat-label">内存使用</span><span class="stat-value">${formatBytes(memUsed)} / ${formatBytes(memTotal)}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${memPct}%"></div></div>
        <div class="stat-row" style="margin-top:0.75rem"><span class="stat-label">RSS 内存</span><span class="stat-value">${formatBytes(data.resources?.memory?.resident_set_memory || 0)}</span></div>
        <div class="stat-row"><span class="stat-label">负载均值</span><span class="stat-value">${(data.resources?.load_average || []).join(" / ")}</span></div>
        <div class="stat-row"><span class="stat-label">CPU 核心</span><span class="stat-value">${data.resources?.hardware_concurrency || "未知"}</span></div>
      </div>

      <div class="card">
        <div class="card-title">上游矿池</div>
        <div class="stat-row"><span class="stat-label">活跃</span><span class="stat-value highlight-green">${data.upstreams?.active || 0}</span></div>
        <div class="stat-row"><span class="stat-label">休眠</span><span class="stat-value">${data.upstreams?.sleep || 0}</span></div>
        <div class="stat-row"><span class="stat-label">错误</span><span class="stat-value ${(data.upstreams?.error || 0) > 0 ? "highlight-red" : ""}">${data.upstreams?.error || 0}</span></div>
        <div class="stat-row"><span class="stat-label">总计</span><span class="stat-value">${data.upstreams?.total || 0}</span></div>
        <div class="stat-row"><span class="stat-label">平均矿工/池</span><span class="stat-value">${upstreamRatio}</span></div>
      </div>
    </div>

    <div class="grid">
      <div class="card large-card">
        <div class="card-title">挖矿结果</div>
        <div class="metrics-grid">
          <div class="metric-item"><div class="metric-value highlight-green">${formatNumber(accepted)}</div><div class="metric-label">已接受</div></div>
          <div class="metric-item"><div class="metric-value highlight-red">${formatNumber(rejected)}</div><div class="metric-label">已拒绝</div></div>
          <div class="metric-item"><div class="metric-value highlight-yellow">${formatNumber(data.results?.invalid || 0)}</div><div class="metric-label">无效</div></div>
          <div class="metric-item"><div class="metric-value">${formatNumber(data.results?.expired || 0)}</div><div class="metric-label">过期</div></div>
          <div class="metric-item"><div class="metric-value highlight-blue">${acceptance}%</div><div class="metric-label">接受率</div></div>
          <div class="metric-item"><div class="metric-value">${data.results?.latency || 0} ms</div><div class="metric-label">延迟</div></div>
        </div>
        <div class="stat-row" style="margin-top:1rem"><span class="stat-label">总哈希数</span><span class="stat-value">${formatNumber(data.results?.hashes_total || 0)}</span></div>
        <div class="stat-row"><span class="stat-label">平均提交时间</span><span class="stat-value">${data.results?.avg_time || 0} 秒</span></div>
      </div>
    </div>
  `;

  els.dashboard.innerHTML = html;
  els.dashboard.className = "";

  // Initialize chart point tooltips (one delegated listener per chart,
  // instead of one per data point per render).
  initChartTooltips();
}

/**
 * Wire a single delegated tooltip handler onto every render's chart
 * container. The chart container is re-created on every renderDashboard,
 * so the delegated listener is per-instance — both the chart container
 * and its tooltip node die together when `innerHTML` wipes the parent,
 * which keeps the listener count bounded at exactly one per render.
 *
 * @returns {void}
 */
function initChartTooltips() {
  const chartContainer = document.querySelector(".hashrate-chart");
  if (!chartContainer) return;

  let tooltip = chartContainer.querySelector(".chart-point-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-point-tooltip";
    chartContainer.appendChild(tooltip);
  }

  chartContainer.addEventListener("mouseover", e => {
    const point = e.target.closest(".chart-point");
    if (!point || !chartContainer.contains(point)) return;
    tooltip.textContent = `${point.dataset.label}: ${point.dataset.value}`;
    const rect = point.getBoundingClientRect();
    const containerRect = chartContainer.getBoundingClientRect();
    tooltip.style.left = `${rect.left - containerRect.left + rect.width / 2}px`;
    tooltip.style.top  = `${rect.top  - containerRect.top  - 8}px`;
    tooltip.classList.add("visible");
  });
  chartContainer.addEventListener("mouseout", e => {
    if (!e.relatedTarget || !e.relatedTarget.closest?.(".chart-point")) {
      tooltip.classList.remove("visible");
    }
  });
}

/* ==========================================================================
   Settings Modal
   ========================================================================== */
function profileRowHtml(profile, activeId) {
  const active = profile.id === activeId;
  return `
    <div class="profile-row ${active ? "is-active" : ""}" data-profile-id="${escapeHtml(profile.id)}">
      <button class="profile-select" type="button" data-action="select-profile" data-profile-id="${escapeHtml(profile.id)}">
        <span class="profile-status-dot" aria-hidden="true"></span>
        <span class="profile-info">
          <strong class="profile-name">${escapeHtml(profile.name)}</strong>
          <span class="profile-url">${escapeHtml(profile.apiUrl)}</span>
        </span>
      </button>
      <button class="profile-delete btn btn-danger" type="button" data-action="delete-profile" data-profile-id="${escapeHtml(profile.id)}" aria-label="删除 ${escapeHtml(profile.name)}" ${loadProfiles().length <= 1 ? "disabled" : ""}>删除</button>
    </div>
  `;
}

function openSettingsModal(selectedProfileId = null) {
  const profiles = loadProfiles();
  const activeId = loadActiveProfileId();
  const selectedId = selectedProfileId || activeId || profiles[0]?.id || null;
  const selected = selectedId === "__new__" ? null : (profiles.find(profile => profile.id === selectedId) || null);
  const cfg = selected || {
    id: "",
    name: "",
    apiUrl: "",
    apiToken: "",
    remember: true,
    refreshInterval: 10,
  };
  const themePreference = loadTheme();

  const modalHtml = `
    <div class="modal-overlay" id="settingsModal" role="dialog" aria-labelledby="modal-title" aria-modal="true">
      <div class="modal profile-modal">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">Proxy 配置</h3>
          <button class="modal-close" aria-label="关闭">&times;</button>
        </div>
        <div class="modal-body">
          <div class="profile-list-header">
            <span class="input-label">已保存的 Proxy</span>
            <button class="btn btn-secondary btn-sm" id="newProfile">+ 新建 Proxy</button>
          </div>
          <div class="profile-transfer-actions">
            <button class="btn btn-secondary btn-sm" id="exportProfiles" type="button">导出配置</button>
            <button class="btn btn-secondary btn-sm" id="importProfiles" type="button">导入配置</button>
            <input id="profileImportFile" type="file" accept=".json,application/json" aria-label="选择要导入的 Proxy 配置 JSON 文件" hidden>
          </div>
          <p class="input-hint profile-transfer-warning">导出文件可能包含访问 Token；请妥善保管。导入会合并配置，同 ID 项目将被覆盖。文件只在本机处理，不会上传。</p>
          <div class="profile-list" id="profileList">
            ${profiles.length ? profiles.map(profile => profileRowHtml(profile, activeId)).join("") : '<p class="profile-empty">暂无保存的 Proxy 配置</p>'}
          </div>
          <div class="profile-editor" id="profileEditor">
            <div class="profile-editor-heading">
              <span class="input-label">${selected ? "编辑配置" : "新建配置"}</span>
              ${selected && selected.id === activeId ? '<span class="profile-active-label">当前使用</span>' : ""}
            </div>
            <div class="input-group">
              <label class="input-label" for="sProfileName">配置名称</label>
              <input type="text" class="input-field" id="sProfileName" value="${escapeHtml(cfg.name)}" maxlength="64" placeholder="例如：主 Proxy">
            </div>
            <div class="input-group">
              <label class="input-label" for="sApiUrl">API URL</label>
              <input type="url" class="input-field" id="sApiUrl" value="${escapeHtml(cfg.apiUrl)}" required>
            </div>
            <div class="input-group">
              <label class="input-label" for="sApiToken">Access Token</label>
              <input type="password" class="input-field" id="sApiToken" value="${escapeHtml(cfg.apiToken)}" autocomplete="password">
            </div>
            <div class="input-group">
              <label class="input-label" for="sRefreshInterval">自动刷新间隔 (秒)</label>
              <input type="number" class="input-field" id="sRefreshInterval" value="${cfg.refreshInterval ?? 10}" min="1" max="120" required>
              <span class="input-hint">最小 1 秒，最大 120 秒</span>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="sRemember" ${cfg.remember ? "checked" : ""}>
              <label for="sRemember">记住我 (localStorage)</label>
            </div>
            <div class="input-group">
              <label class="input-label" for="sTheme">外观主题</label>
              <select class="input-field" id="sTheme">
                <option value="system" ${themePreference === "system" ? "selected" : ""}>跟随系统</option>
                <option value="dark" ${themePreference === "dark" ? "selected" : ""}>深色模式</option>
                <option value="light" ${themePreference === "light" ? "selected" : ""}>浅色模式</option>
              </select>
              <span class="input-hint">选择“跟随系统”后，面板会随设备的明暗外观自动切换。</span>
            </div>
            <div class="config-actions">
              <button class="btn btn-secondary" id="cancelSettings">取消</button>
              <button class="btn btn-danger" id="logoutBtn">登出</button>
              <button class="btn" id="saveSettings">保存并切换</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const overlay = document.getElementById("settingsModal");
  requestAnimationFrame(() => overlay.classList.add("open"));

  const reconnectProfile = async profile => {
    // Stop the previous profile's polling/request before issuing requests with
    // the newly selected profile, so a late response cannot overwrite it.
    stopAutoRefresh();
    closeModal(overlay);
    showToast("正在连接 " + profile.name + "...", "info");
    renderSkeleton(els.dashboard, 6);
    resetStatusTracker(statusTracker);
    try {
      const summaryPromise = request("/1/summary");
      const probePromise = probeWriteAccess();
      const data = await summaryPromise;
      renderDashboard(data);
      applyProbeResult(await probePromise, true);
      setRibbonConnectState("connected");
      syncModePickerAltRow();
      startAutoRefresh();
      showToast("已切换到 " + profile.name, "success");
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        // The previous profile's timer may still be active while switching.
        // Stop it before clearing credentials to avoid repeated config errors.
        stopAutoRefresh();
        clearConfigWithWarning();
        markDisconnected({ clearWriteAccess: true });
        showToast("认证失败，请检查 Token", "error");
        renderConnectForm({ apiUrl: profile.apiUrl, apiToken: profile.apiToken, remember: profile.remember });
      } else {
        showToast("连接失败: " + err.message, "error");
        stopAutoRefresh();
        // The selected profile is already active. Restore an actionable
        // connection form instead of leaving the dashboard on a skeleton.
        renderConnectForm({ apiUrl: profile.apiUrl, apiToken: profile.apiToken, remember: profile.remember });
      }
    }
  };

  overlay.querySelector(".modal-close").addEventListener("click", () => closeModal(overlay));
  document.getElementById("cancelSettings").addEventListener("click", () => closeModal(overlay));
  document.getElementById("newProfile").addEventListener("click", () => {
    closeModal(overlay);
    openSettingsModal("__new__");
  });

  document.getElementById("exportProfiles").addEventListener("click", () => {
    const confirmed = confirm(
      "导出的 JSON 文件可能包含一个或多个 Proxy 的访问 Token。文件会在本机生成并下载，不会上传；任何拿到文件的人都可能使用其中的 Token。确定导出？",
    );
    if (!confirmed) return;

    try {
      const bundle = createProfilesExport();
      const json = JSON.stringify(bundle, null, 2);
      if (new TextEncoder().encode(json).byteLength > 1024 * 1024) {
        showToast("导出文件超过 1 MB 限制，请减少配置数量或 Token 长度后重试", "error");
        return;
      }
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = downloadUrl;
      link.download = "xmrig-proxy-profiles-" + stamp + ".json";
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
      showToast("配置已导出。请妥善保管可能包含访问 Token 的文件", "success");
    } catch (error) {
      showToast(error?.message || "导出配置失败，请检查浏览器存储", "error");
    }
  });

  const profileImportFile = document.getElementById("profileImportFile");
  document.getElementById("importProfiles").addEventListener("click", () => {
    profileImportFile.click();
  });
  profileImportFile.addEventListener("change", async () => {
    const file = profileImportFile.files?.[0];
    if (!file) return;

    try {
      if (file.size > 1024 * 1024) {
        throw new Error("导入文件超过 1 MB 限制");
      }
      const bundle = parseProfilesImportJson(await file.text());
      const accepted = confirm(
        "已验证 " + bundle.profiles.length + " 个配置。导入将按配置 ID 合并；相同 ID 的现有配置会被覆盖，其他配置保留。文件可能包含访问 Token，仅会写入本地浏览器存储。继续导入？",
      );
      if (!accepted) return;

      let result;
      try {
        result = importProfiles(bundle.profiles);
      } catch (error) {
        if (error?.code !== "ACTIVE_PROFILE_FALLBACK_CONSENT_REQUIRED") throw error;
        const allowFallback = confirm(
          "检测到当前活动配置已失效。继续导入将自动选择第一个可用配置作为当前配置。是否继续？",
        );
        if (!allowFallback) return;
        result = importProfiles(bundle.profiles, { allowActiveProfileFallback: true });
      }
      const fallbackNotice = result.activeProfileFallback
        ? " 原活动配置已失效，已按你的确认自动选择第一个可用配置。"
        : "";
      showToast("导入完成：新增 " + result.added + " 个，更新 " + result.updated + " 个。" + fallbackNotice + " 请检查配置列表", "success");
      replaceSettingsModal(overlay);
    } catch (error) {
      showToast(error?.message || "导入失败：文件无效或浏览器存储不可用", "error");
    } finally {
      profileImportFile.value = "";
    }
  });

  overlay.querySelectorAll('[data-action="select-profile"]').forEach(button => {
    button.addEventListener("click", async () => {
      const requestedId = button.dataset.profileId;
      if (requestedId === loadActiveProfileId()) {
        showToast("当前已在使用该 Proxy 配置", "info");
        return;
      }
      const lookup = getProfileById(requestedId);
      if (lookup.status === "storage-unavailable") {
        showToast("无法读取 Proxy 配置：浏览器存储不可用，请检查存储设置后重试", "error");
        return;
      }
      if (lookup.status === "not-found") {
        showToast("该 Proxy 配置已不存在，请刷新配置列表后重试", "warn");
        return;
      }
      const profile = setActiveProfile(requestedId);
      if (!profile) {
        showToast(storageFailureMessage(
          "无法切换配置：浏览器存储不可用或空间不足，原连接状态已尽力保留",
          "切换失败，而且浏览器存储未能完整恢复原连接状态。请清理此站点的浏览数据后重新配置",
        ), "error");
        return;
      }
      await reconnectProfile(profile);
    });
  });

  overlay.querySelectorAll('[data-action="delete-profile"]').forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.profileId;
      const profile = loadProfiles().find(item => item.id === id);
      if (!profile) return;
      if (loadProfiles().length <= 1) {
        showToast("至少保留一个 Proxy 配置", "warn");
        return;
      }
      if (!confirm("确定删除「" + profile.name + "」？")) return;
      const wasActive = id === loadActiveProfileId();
      if (!deleteProfile(id)) {
        showToast(storageFailureMessage(
          "删除配置失败：浏览器存储不可用或空间不足，未能完成删除。请检查存储设置后重试",
          "删除失败，而且浏览器存储未能完整恢复之前的状态。配置或凭据可能不一致，请清理此站点的浏览数据后重新配置",
        ), "error");
        return;
      }
      if (wasActive) {
        const next = getActiveProfile();
        if (next && !setActiveProfile(next.id)) {
          showToast("配置已删除，但无法切换当前配置：浏览器存储不可用", "error");
          return;
        }
      }
      replaceSettingsModal(overlay);
      showToast("已删除 " + profile.name, "info");
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    const cleared = clearConfigWithWarning({ showWarning: false });
    resetStatusTracker(statusTracker);
    markDisconnected({ clearWriteAccess: true });
    closeModePicker();
    closeModal(overlay);
    showToast(
      cleared
        ? "已登出当前连接；已保存的 Proxy 配置及其记住的凭据仍保留"
        : "浏览器拒绝清理部分连接状态；请清理此站点的浏览数据后重试",
      cleared ? "info" : "error",
    );
    renderConnectForm();
    stopAutoRefresh();
  });

  const saveSettingsButton = document.getElementById("saveSettings");
  saveSettingsButton.addEventListener("click", async () => {
    if (saveSettingsButton.disabled) return;
    const name = document.getElementById("sProfileName").value.trim();
    const url = document.getElementById("sApiUrl").value.trim();
    const token = document.getElementById("sApiToken").value.trim();
    const remember = document.getElementById("sRemember").checked;
    const themePreference = document.getElementById("sTheme").value;
    const refreshInput = document.getElementById("sRefreshInterval");
    const refreshInterval = Number.isFinite(parseInt(refreshInput?.value, 10)) ? parseInt(refreshInput.value, 10) : 10;

    if (!name) { showToast("请输入配置名称", "error"); return; }
    if (!url) { showToast("请输入 API URL", "error"); return; }
    const urlError = getApiUrlValidationError(url);
    if (urlError) {
      showApiUrlValidationError(urlError, "无效的 URL");
      return;
    }
    if (refreshInterval < 1 || refreshInterval > 120) {
      showToast("刷新间隔必须在 1-120 秒之间", "error");
      return;
    }
    if (/[\u0000-\u001F\u007F]/.test(name) || /[\u0000-\u001F\u007F]/.test(token)) {
      showToast("配置名称和 Token 不能包含控制字符", "error");
      return;
    }

    saveSettingsButton.disabled = true;
    saveSettingsButton.textContent = "保存中...";

    const profile = saveProfile({
      id: selectedId === "__new__" ? undefined : selectedId,
      name,
      apiUrl: url,
      apiToken: token,
      remember,
      refreshInterval,
    });
    if (!profile) {
      showToast(storageFailureMessage(
        "配置保存失败：浏览器存储不可用或空间不足，请检查存储设置后重试",
        "配置保存失败，而且浏览器存储未能完整恢复之前的状态。配置或凭据可能不一致，请清理此站点的浏览数据后重新配置",
      ), "error");
      saveSettingsButton.disabled = false;
      saveSettingsButton.textContent = "保存并切换";
      return;
    }

    try {
      applyThemePreference(themePreference, { persist: true });
      await reconnectProfile(profile);
    } catch (err) {
      showToast("配置已保存，但切换连接失败: " + (err?.message || "未知错误"), "error");
    } finally {
      saveSettingsButton.disabled = false;
      saveSettingsButton.textContent = "保存并切换";
    }
  });

  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(overlay); });
  const escHandler = e => { if (e.key === "Escape" && overlay.parentNode) closeModal(overlay); };
  document.addEventListener("keydown", escHandler);
  overlay._escHandler = escHandler;
}

function replaceSettingsModal(overlay, selectedProfileId = null) {
  // This is a content replacement, not a user-requested animated close.
  // Remove the old node synchronously to avoid duplicate modal IDs while
  // the refreshed profile list is rendered.
  if (overlay._escHandler) {
    document.removeEventListener("keydown", overlay._escHandler);
    overlay._escHandler = null;
  }
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  openSettingsModal(selectedProfileId);
}


function closeModal(overlay) {
  if (!overlay.parentNode) {
    // Already detached — still need to release the ESC handler, which
    // lives on `document` and would otherwise leak across opens.
    if (overlay._escHandler) {
      document.removeEventListener("keydown", overlay._escHandler);
      overlay._escHandler = null;
    }
    return;
  }
  overlay.classList.remove("open");
  // Detach listener registered by openSettingsModal so the document does
  // not accumulate one stale ESC handler per settings open.
  if (overlay._escHandler) {
    document.removeEventListener("keydown", overlay._escHandler);
    overlay._escHandler = null;
  }
  // .modal-overlay defines `transition: opacity var(--transition-normal)`,
  // so a single `transitionend` (for `opacity`) removes the node as soon
  // as the fade finishes. When the user has `prefers-reduced-motion:
  // reduce` the transition has zero duration and `transitionend` fires
  // synchronously inside the class-removal step, which is still fine.
  overlay.addEventListener("transitionend", () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }, { once: true });
}

/* ==========================================================================
   Auto-refresh Management
   ========================================================================== */
async function fetchAndRender() {
  // Abort older requests so slow responses cannot overwrite newer dashboard data.
  if (fetchAbortController) fetchAbortController.abort();
  const controller = new AbortController();
  fetchAbortController = controller;

  try {
    const data = await request("/1/summary", { signal: controller.signal });
    if (controller.signal.aborted) return;
    renderDashboard(data);
  } catch (err) {
    if (controller.signal.aborted || err.name === "AbortError" || err.name === "CancellationError") {
      return;
    }
    if (err.status === 401 || err.status === 403) {
      clearConfigWithWarning();
      resetStatusTracker(statusTracker);
      // Auth failure invalidates the persisted write flag (the token no
      // longer matches), but a transient network/5xx does not — see
      // markDisconnected docs.
      markDisconnected({ clearWriteAccess: true });
      showToast("会话过期，请重新登录", "error");
      renderConnectForm();
      stopAutoRefresh();
    } else {
      showToast(`刷新失败: ${err.message}`, "error");
    }
  } finally {
    if (fetchAbortController === controller) fetchAbortController = null;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  const cfg = getConfig();
  const interval = (cfg?.refreshInterval ?? 10) * 1000; // seconds → ms
  refreshInterval = setInterval(fetchAndRender, Math.max(1000, Math.min(120000, interval)));
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  if (fetchAbortController) {
    fetchAbortController.abort();
    fetchAbortController = null;
  }
}

/* ==========================================================================
   Initialization
   ========================================================================== */
async function init() {
  // Initialize theme
  initTheme();

  // Wire settings button
  els.editUrl.addEventListener("click", openSettingsModal);

  // Wire the view-mode ribbon: click or keyboard activation opens the
  // mode picker. The ribbon itself never closes the picker — that lives
  // on document-level listeners owned by openModePicker().
  if (els.viewModeBadge) {
    els.viewModeBadge.addEventListener("click", e => {
      e.stopPropagation();
      if (modePickerEl?.classList.contains("open")) {
        closeModePicker();
      } else {
        openModePicker();
      }
    });
    els.viewModeBadge.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        els.viewModeBadge.click();
      }
    });
  }

  // Initial ribbon state: until a successful render proves otherwise, the
  // panel is not actually talking to anything — paint it yellow so the
  // operator sees the not-connected state at a glance.
  setRibbonConnectState("disconnected");

  // Background tabs throttle timers, so refresh immediately when the user
  // returns. fetchAndRender() owns in-flight request deduplication. Keep the
  // handler scoped to read-only mode so it cannot replace an open settings UI.
  cleanupVisibilityRefresh?.();
  cleanupVisibilityRefresh = registerVisibilityRefresh({
    documentRef: document,
    hasConfig: () => Boolean(getConfig()),
    shouldRefresh: () => activeDashboardMode === "readonly",
    refresh: fetchAndRender,
  });

  // Load saved config
  const cfg = loadConfig();
  if (consumeConfigCleanupWarning()) {
    showToast("发现损坏的连接配置，但浏览器阻止清理；请清理此站点的浏览数据后重试", "warn");
  }
  if (cfg) {
    // Show skeleton while fetching
    renderSkeleton(els.dashboard, 6);
    await fetchAndRender();
    // fetchAndRender handles errors internally. On an authentication
    // failure it clears the saved connection, so don't restart polling
    // after the user has been returned to the connect form.
    if (getConfig()) startAutoRefresh();
  } else {
    renderConnectForm();
  }
}


/* ==========================================================================
   Bootstrap
   ========================================================================== */
document.addEventListener("DOMContentLoaded", init);
