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

import { request } from "./api.js";
import {
  loadConfig, saveConfig, clearConfig, getConfig,
  loadTheme, saveTheme,
} from "./storage.js";
import {
  showToast,
  renderSkeleton,
  formatHashrate,
  formatBytes,
  formatUptime,
  formatNumber,
  getStatusInfo,
} from "./ui.js";

// Global state
let refreshInterval = null;
let isFetching = false;

/* ==========================================================================
   Theme Management
   The theme is owned by storage.js — never read or write localStorage
   directly here.
   ========================================================================== */
function initTheme() {
  const theme = loadTheme();
  document.documentElement.setAttribute("data-theme", theme);
  // The view-mode badge lives in the header on every page; flip its label
  // alongside the theme so the "you are looking, not driving" signal keeps
  // speaking the user's language.
  syncViewModeBadgeText(theme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  saveTheme(newTheme);
  syncViewModeBadgeText(newTheme);
  showToast(`已切换到${newTheme === "dark" ? "深色" : "浅色"}模式`, "info");
}

/**
 * Update the persistent "view-only" ribbon's text to match the active theme.
 * Kept as a single helper so both `initTheme`, `toggleTheme`, and the
 * settings-modal save branch call the same source of truth.
 *
 * @param {"dark"|"light"} theme
 */
function syncViewModeBadgeText(theme) {
  const label = document.getElementById("viewModeBadgeText");
  if (!label) return;
  label.textContent = theme === "dark" ? "只读视图" : "Read-only viewer";
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
};

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
  const url = document.getElementById("apiUrlInput").value.trim();
  const token = document.getElementById("apiTokenInput").value.trim();
  const remember = document.getElementById("rememberMe").checked;

  if (!url) {
    showToast("请输入 API URL", "error");
    return;
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    showToast("无效的 URL 格式", "error");
    return;
  }

  // Save config first (so request() can read it)
  saveConfig({ apiUrl: url, apiToken: token, remember });

  // Show loading skeleton
  renderSkeleton(els.dashboard, 6);
  els.statusBadge.textContent = "连接中...";
  els.statusBadge.className = "status-badge status-warning";

  try {
    // Test connection
    const data = await request("/1/summary");
    showToast("连接成功", "success");
    renderDashboard(data);
    startAutoRefresh();
  } catch (err) {
    // Clear invalid config on auth failure
    if (err.status === 401 || err.status === 403) {
      clearConfig();
      showToast("认证失败：Token 无效或已过期", "error");
    } else if (err.message.includes("timed out")) {
      showToast("连接超时，请检查地址和网络", "error");
    } else {
      showToast(`连接失败: ${err.message}`, "error");
    }
    renderConnectForm({ apiUrl: url, apiToken: token, remember });
  }
}

/* ==========================================================================
   Dashboard Rendering
   ========================================================================== */
function renderDashboard(data) {
  // Header info
  const status = getStatusInfo(data.miners);
  els.statusBadge.textContent = status.text;
  els.statusBadge.className = `status-badge ${status.cls}`;
  els.workerId.textContent = `Worker: ${escapeHtml(data.worker_id || "未知")} | 版本: ${escapeHtml(data.version || "未知")}`;
  els.lastUpdate.textContent = new Date().toLocaleTimeString();

  // Re-sync the view-mode ribbon on every render. Defensive against any
  // race where initTheme() ran before this element existed in the DOM.
  syncViewModeBadgeText(document.documentElement.getAttribute("data-theme") || "dark");

  // Hashrate data
  const hashrates = data.hashrate?.total || [0,0,0,0,0,0];
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
  const chartWidth = 280;
  const chartHeight = 60;
  const padding = 20;
  const points = hashrates.map((h, i) => {
    const x = padding + (i / (hashrates.length - 1)) * (chartWidth - 2 * padding);
    const y = chartHeight - padding - ((h / maxHr) * (chartHeight - 2 * padding));
    return { x, y, value: formatHashrate(h), label: timeLabels[i], color: chartColors[i] };
  });
  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const lineChart = `
    <svg class="hashrate-line-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" width="100%" height="100%">
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
        <line x1="${padding}" y1="${padding}" x2="${chartWidth - padding}" y2="${padding}"/>
        <line x1="${padding}" y1="${chartHeight / 2}" x2="${chartWidth - padding}" y2="${chartHeight / 2}"/>
        <line x1="${padding}" y1="${chartHeight - padding}" x2="${chartWidth - padding}" y2="${chartHeight - padding}"/>
      </g>
      <!-- Area under curve -->
      <path d="${pathData} L ${chartWidth - padding} ${chartHeight - padding} L ${padding} ${chartHeight - padding} Z"
            fill="url(#hrGradient)" stroke="none"/>
      <!-- Line segments with different colors -->
      ${points.slice(1).map((p, i) => `
        <path d="M ${points[i].x} ${points[i].y} L ${p.x} ${p.y}" stroke="${p.color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      `).join('')}
      <!-- Data points with individual colors -->
      ${points.map((p, i) => `
        <circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4"
                fill="${p.color}" stroke="var(--bg-card)" stroke-width="2"
                data-label="${escapeHtml(p.label)}" data-value="${escapeHtml(p.value)}" />
      `).join('')}
      <!-- X-axis labels -->
      ${points.map(p => `
        <text x="${p.x}" y="${chartHeight - 4}" text-anchor="middle"
              font-size="0.55rem" fill="var(--text-muted)" class="chart-label">${escapeHtml(p.label)}</text>
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
  const upstreamRatio = data.upstreams?.ratio ? data.upstreams.ratio.toFixed(1) : "0.0";

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
function openSettingsModal() {
  const cfg = getConfig() || { apiUrl: "", apiToken: "", remember: true, refreshInterval: 10 };
  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
  const modalHtml = `
    <div class="modal-overlay" id="settingsModal" role="dialog" aria-labelledby="modal-title" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">设置</h3>
          <button class="modal-close" aria-label="关闭">&times;</button>
        </div>
        <div class="modal-body">
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
          <div class="checkbox-group">
            <input type="checkbox" id="sTheme" ${currentTheme === 'dark' ? "checked" : ""}>
            <label for="sTheme">深色模式</label>
          </div>
          <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
            <button class="btn btn-secondary" id="cancelSettings">取消</button>
            <button class="btn btn-danger" id="logoutBtn">登出</button>
            <button class="btn" id="saveSettings">保存并重连</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const overlay = document.getElementById("settingsModal");
  // Force reflow then open
  requestAnimationFrame(() => overlay.classList.add("open"));

  // Event listeners
  overlay.querySelector(".modal-close").addEventListener("click", () => closeModal(overlay));
  document.getElementById("cancelSettings").addEventListener("click", () => closeModal(overlay));
  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearConfig();
    closeModal(overlay);
    showToast("已登出", "info");
    renderConnectForm();
    stopAutoRefresh();
  });
  document.getElementById("saveSettings").addEventListener("click", async () => {
    const url = document.getElementById("sApiUrl").value.trim();
    const token = document.getElementById("sApiToken").value.trim();
    const remember = document.getElementById("sRemember").checked;
    const themeWantsDark = document.getElementById("sTheme").checked;
    const refreshInput = document.getElementById("sRefreshInterval");
    const refreshInterval = Number.isFinite(parseInt(refreshInput?.value, 10))
      ? parseInt(refreshInput.value, 10)
      : 10;

    if (!url) { showToast("请输入 API URL", "error"); return; }
    try { new URL(url); } catch { showToast("无效的 URL", "error"); return; }
    if (refreshInterval < 1 || refreshInterval > 120) { showToast("刷新间隔必须在 1-120 秒之间", "error"); return; }

    saveConfig({ apiUrl: url, apiToken: token, remember, refreshInterval });
    // Theme lives in its own storage slot — see storage.js.
    const theme = themeWantsDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    saveTheme(theme);
    syncViewModeBadgeText(theme);

    closeModal(overlay);
    showToast("设置已保存，正在重新连接...", "info");

    renderSkeleton(els.dashboard, 6);
    try {
      const data = await request("/1/summary");
      renderDashboard(data);
      startAutoRefresh();
      showToast("重新连接成功", "success");
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        clearConfig();
        showToast("认证失败，请检查 Token", "error");
        renderConnectForm({ apiUrl: url, apiToken: token, remember });
      } else {
        showToast(`连接失败: ${err.message}`, "error");
      }
      stopAutoRefresh();
    }
  });

  // Close on overlay click
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(overlay); });
  // Escape key — listener is removed by closeModal() so every close path
  // (X, cancel, overlay click, save, logout) cleans it up.
  const escHandler = e => { if (e.key === "Escape" && overlay.parentNode) closeModal(overlay); };
  document.addEventListener("keydown", escHandler);
  overlay._escHandler = escHandler;
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
  if (isFetching) return;
  isFetching = true;
  try {
    const data = await request("/1/summary");
    renderDashboard(data);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      clearConfig();
      showToast("会话过期，请重新登录", "error");
      renderConnectForm();
      stopAutoRefresh();
    } else {
      showToast(`刷新失败: ${err.message}`, "error");
    }
  } finally {
    isFetching = false;
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
}

/* ==========================================================================
   Initialization
   ========================================================================== */
function init() {
  // Initialize theme
  initTheme();

  // Wire settings button
  els.editUrl.addEventListener("click", openSettingsModal);

  // Load saved config
  const cfg = loadConfig();
  if (cfg) {
    // Show skeleton while fetching
    renderSkeleton(els.dashboard, 6);
    fetchAndRender().then(() => startAutoRefresh()).catch(() => {
      // If fetch fails, show connect form with prefilled values
      renderConnectForm(cfg);
    });
  } else {
    renderConnectForm();
  }
}

/* ==========================================================================
   Utility: HTML Escape (XSS prevention)
   ========================================================================== */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  // Build entity strings by concatenation so the leading '&' and
  // trailing ';' cannot be silently stripped (see PR code-review fix,
  // project memory xss-escape-html-gotcha — writing the entities
  // literally here once shipped to main as bare characters and made
  // the dashboard an XSS sink because the inputs came from innerHTML
  // writes of apiUrl/apiToken).
  // '&' must be replaced first to avoid double-encoding the entities
  // produced by the remaining rules.
  const ENT_AMP  = "&" + "amp;";
  const ENT_LT   = "&" + "lt;";
  const ENT_GT   = "&" + "gt;";
  const ENT_QUOT = "&" + "quot;";
  const ENT_APOS = "&" + "#039;";
  return String(str)
    .replace(/&/g, ENT_AMP)
    .replace(/</g, ENT_LT)
    .replace(/>/g, ENT_GT)
    .replace(/\"/g, ENT_QUOT)
    .replace(/'/g, ENT_APOS);
}

/* ==========================================================================
   Bootstrap
   ========================================================================== */
document.addEventListener("DOMContentLoaded", init);
