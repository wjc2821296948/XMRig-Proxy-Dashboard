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
import { loadConfig, saveConfig, clearConfig, getConfig } from "./storage.js";
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
      <h2 id="connect-title" class="config-title">连接 XMRig Proxy</h2>
      <div class="input-group">
        <label class="input-label" for="apiUrlInput">API URL</label>
        <input type="url" class="input-field" id="apiUrlInput" placeholder="http://your-proxy:8080/1/summary" value="${escapeHtml(apiUrl)}" required autocomplete="url">
      </div>
      <div class="input-group">
        <label class="input-label" for="apiTokenInput">Access Token</label>
        <input type="password" class="input-field" id="apiTokenInput" placeholder="留空表示无需 Token" value="${escapeHtml(apiToken)}" autocomplete="password">
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="rememberMe" ${remember ? "checked" : ""}>
        <label for="rememberMe">记住我 (localStorage)</label>
      </div>
      <div class="config-actions">
        <button class="btn" id="connectBtn">连接</button>
      </div>
      <p style="margin-top:0.75rem;font-size:0.65rem;color:var(--text-muted);text-align:center;">
        所有数据仅保存在浏览器本地，服务器无法访问。
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

  // Hashrate data
  const hashrates = data.hashrate?.total || [0,0,0,0,0,0];
  const maxHr = Math.max(...hashrates, 1);
  const hrBars = hashrates.map(h => `<div class="hashrate-bar" style="height:${(h/maxHr*100).toFixed(1)}%"></div>`).join("");

  // Memory usage
  const memUsed = data.resources?.memory?.total - data.resources?.memory?.free || 0;
  const memTotal = data.resources?.memory?.total || 1;
  const memPct = ((memUsed / memTotal) * 100).toFixed(1);

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
        <div class="hashrate-chart">${hrBars}</div>
      </div>

      <div class="card">
        <div class="card-title">活跃矿工</div>
        <div class="card-value ${data.miners?.now > 0 ? "highlight-green" : "highlight-red"}">${formatNumber(data.miners?.now || 0)}</div>
        <div class="card-label">峰值: ${formatNumber(data.miners?.max || 0)} 矿工</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${data.miners?.max ? (data.miners.now/data.miners.max*100).toFixed(1) : 0}%"></div></div>
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
}

/* ==========================================================================
   Settings Modal
   ========================================================================== */
function openSettingsModal() {
  const cfg = getConfig() || { apiUrl: "", apiToken: "", remember: true };
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
          <div class="checkbox-group">
            <input type="checkbox" id="sRemember" ${cfg.remember ? "checked" : ""}>
            <label for="sRemember">记住我 (localStorage)</label>
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

    if (!url) { showToast("请输入 API URL", "error"); return; }
    try { new URL(url); } catch { showToast("无效的 URL", "error"); return; }

    saveConfig({ apiUrl: url, apiToken: token, remember });
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
  // Escape key
  const escHandler = e => { if (e.key === "Escape") { closeModal(overlay); document.removeEventListener("keydown", escHandler); } };
  document.addEventListener("keydown", escHandler);
}

function closeModal(overlay) {
  overlay.classList.remove("open");
  overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
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
  refreshInterval = setInterval(fetchAndRender, 10000);
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
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/\"/g, "\"")
    .replace(/'/g, "&#039;");
}

/* ==========================================================================
   Bootstrap
   ========================================================================== */
document.addEventListener("DOMContentLoaded", init);
