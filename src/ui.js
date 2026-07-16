/**
 * ui.js – UI utilities and rendering functions.
 *
 * Provides:
 *  - Skeleton loading placeholders
 *  - Toast notifications
 *  - Dashboard rendering
 *  - Settings modal
 *  - Logout handling
 */

// Toast notification system
let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    document.body.appendChild(toastContainer);
  }
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {"info"|"success"|"error"|"warning"} type
 * @param {number} durationMs
 */
export function showToast(message, type = "info", durationMs = 3000) {
  ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  // Force reflow for animation
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, durationMs);
}

/**
 * Create a skeleton placeholder for a card.
 * @param {number} lines Number of text lines to simulate.
 */
function createSkeletonCard(lines = 3) {
  const card = document.createElement("div");
  card.className = "card skeleton";
  for (let i = 0; i < lines; i++) {
    const line = document.createElement("div");
    line.className = "skeleton-line";
    card.appendChild(line);
  }
  return card;
}

/**
 * Render skeleton placeholders while data is loading.
 * @param {HTMLElement} container Target container.
 * @param {number} count Number of skeleton cards.
 */
export function renderSkeleton(container, count = 6) {
  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid";
  for (let i = 0; i < count; i++) {
    grid.appendChild(createSkeletonCard(i < 4 ? 2 : 4));
  }
  container.appendChild(grid);
}

/**
 * Format hashrate from KH/s to human readable.
 */
export function formatHashrate(kh) {
  if (!kh || kh === 0) return "0 H/s";
  if (kh >= 1000) return `${(kh / 1000).toFixed(2)} MH/s`;
  return `${kh.toFixed(2)} KH/s`;
}

/**
 * Format bytes to human readable.
 */
export function formatBytes(bytes) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

/**
 * Format uptime seconds to "Xd Yh Zm".
 */
export function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

/**
 * Format number with thousand separators.
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Determine status class and text.
 */
export function getStatusInfo(miners) {
  if (!miners || miners.now === 0) {
    return { cls: "status-offline", text: "离线" };
  }
  if (miners.now < miners.max * 0.5) {
    return { cls: "status-warning", text: "预警" };
  }
  return { cls: "status-online", text: "在线" };
}

/**
 * Render the main dashboard with API data.
 * @param {Object} data API response from /1/summary
 * @param {HTMLElement} container Target container.
 */
export function renderDashboard(data, container) {
  const { cls, text } = getStatusInfo(data.miners);
  const hashrates = data.hashrate?.total || [];
  const maxHashrate = Math.max(...hashrates, 1);
  const memoryUsedPct = ((data.resources?.memory?.total - data.resources?.memory?.free) / data.resources?.memory?.total * 100).toFixed(1);
  const acceptanceRate = ((data.results?.accepted || 0) / ((data.results?.accepted || 0) + (data.results?.rejected || 0)) * 100).toFixed(2);

  // Build hashrate bar chart
  const hashrateBars = hashrates.map(h => {
    const height = (h / maxHashrate * 100);
    return `<div class="hashrate-bar" style="height: ${height}%"></div>`;
  }).join("");

  container.innerHTML = `
    <div class="grid">
      <div class="card">
        <div class="card-title">当前算力</div>
        <div class="card-value highlight-green">${formatHashrate(hashrates[0])}</div>
        <div class="card-label">10s 平均</div>
        <div class="hashrate-chart">${hashrateBars}</div>
      </div>

      <div class="card">
        <div class="card-title">活跃矿工</div>
        <div class="card-value ${data.miners.now > 0 ? 'highlight-green' : 'highlight-red'}">${formatNumber(data.miners.now)}</div>
        <div class="card-label">峰值: ${formatNumber(data.miners.max)} 矿工</div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${(data.miners.now / data.miners.max * 100)}%"></div></div>
      </div>

      <div class="card">
        <div class="card-title">已连接工人</div>
        <div class="card-value highlight-blue">${data.workers}</div>
        <div class="card-label">矿工/上游: ${data.upstreams.ratio.toFixed(1)}</div>
      </div>

      <div class="card">
        <div class="card-title">运行时间</div>
        <div class="card-value">${formatUptime(data.uptime)}</div>
        <div class="card-label">自上次重启以来</div>
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
        <div class="stat-row"><span class="stat-label">内存使用</span><span class="stat-value">${formatBytes(data.resources.memory.total - data.resources.memory.free)}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${memoryUsedPct}%"></div></div>
        <div class="stat-row"><span class="stat-label">总内存</span><span class="stat-value">${formatBytes(data.resources.memory.total)}</span></div>
        <div class="stat-row"><span class="stat-label">RSS 内存</span><span class="stat-value">${formatBytes(data.resources.memory.resident_set_memory)}</span></div>
        <div class="stat-row"><span class="stat-label">负载平均</span><span class="stat-value">${data.resources.load_average.join(" / ")}</span></div>
        <div class="stat-row"><span class="stat-label">CPU 核心</span><span class="stat-value">${data.resources.hardware_concurrency}</span></div>
      </div>

      <div class="card">
        <div class="card-title">上游矿池</div>
        <div class="stat-row"><span class="stat-label">活跃</span><span class="stat-value highlight-green">${data.upstreams.active}</span></div>
        <div class="stat-row"><span class="stat-label">休眠</span><span class="stat-value">${data.upstreams.sleep}</span></div>
        <div class="stat-row"><span class="stat-label">错误</span><span class="stat-value ${data.upstreams.error > 0 ? 'highlight-red' : ''}">${data.upstreams.error}</span></div>
        <div class="stat-row"><span class="stat-label">总计</span><span class="stat-value">${data.upstreams.total}</span></div>
        <div class="stat-row"><span class="stat-label">平均矿工/池</span><span class="stat-value">${data.upstreams.ratio.toFixed(1)}</span></div>
      </div>
    </div>

    <div class="grid">
      <div class="card large-card">
        <div class="card-title">挖矿结果</div>
        <div class="metrics-grid">
          <div class="metric-item"><div class="metric-value highlight-green">${formatNumber(data.results.accepted)}</div><div class="metric-label">已接受</div></div>
          <div class="metric-item"><div class="metric-value highlight-red">${formatNumber(data.results.rejected)}</div><div class="metric-label">已拒绝</div></div>
          <div class="metric-item"><div class="metric-value highlight-yellow">${formatNumber(data.results.invalid)}</div><div class="metric-label">无效</div></div>
          <div class="metric-item"><div class="metric-value">${formatNumber(data.results.expired)}</div><div class="metric-label">过期</div></div>
          <div class="metric-item"><div class="metric-value highlight-blue">${acceptanceRate}%</div><div class="metric-label">接受率</div></div>
          <div class="metric-item"><div class="metric-value">${data.results.latency} ms</div><div class="metric-label">延迟</div></div>
        </div>
        <div class="stat-row" style="margin-top: 15px;"><span class="stat-label">总哈希数</span><span class="stat-value">${formatNumber(data.results.hashes_total)}</span></div>
        <div class="stat-row"><span class="stat-label">平均提交时间</span><span class="stat-value">${data.results.avg_time} s</span></div>
      </div>
    </div>
  `;
  container.className = "";
}

/**
 * Show error state.
 */
export function renderError(container, message) {
  container.innerHTML = `<div class="error"><strong>错误:</strong> ${message}</div>`;
  container.className = "";
}

/**
 * Settings modal management.
 */
let settingsModal = null;

export function openSettingsModal(onSave) {
  const cfg = { apiUrl: "", apiToken: "", remember: false };
  try {
    const saved = JSON.parse(localStorage.getItem("xmrig_proxy_config") || sessionStorage.getItem("xmrig_proxy_config") || "{}");
    Object.assign(cfg, saved);
  } catch {}

  if (settingsModal) settingsModal.remove();
  settingsModal = document.createElement("div");
  settingsModal.className = "modal-overlay";
  settingsModal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>设置</h3>
        <button class="modal-close" aria-label="关闭">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="apiUrl">API 地址 <span class="required">*</span></label>
          <input type="url" id="apiUrl" class="input" placeholder="http://127.0.0.1:8080/1/summary" value="${cfg.apiUrl}" required>
        </div>
        <div class="form-group">
          <label for="apiToken">Access Token <span class="optional">(可选)</span></label>
          <input type="password" id="apiToken" class="input" placeholder="留空表示无需认证" value="${cfg.apiToken}" autocomplete="off">
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="rememberMe" ${cfg.remember ? "checked" : ""}>
          <label for="rememberMe">记住我 (本地持久化存储)</label>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" id="btnCancel">取消</button>
          <button class="btn btn-primary" id="btnSave">保存并连接</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(settingsModal);
  requestAnimationFrame(() => settingsModal.classList.add("show"));

  settingsModal.querySelector(".modal-close").onclick = closeSettingsModal;
  settingsModal.querySelector("#btnCancel").onclick = closeSettingsModal;
  settingsModal.querySelector("#btnSave").onclick = () => {
    const url = settingsModal.querySelector("#apiUrl").value.trim();
    const token = settingsModal.querySelector("#apiToken").value.trim();
    const remember = settingsModal.querySelector("#rememberMe").checked;
    if (!url) {
      showToast("请输入 API 地址", "error");
      return;
    }
    closeSettingsModal();
    onSave({ apiUrl: url, apiToken: token, remember });
  };
  // Close on overlay click
  settingsModal.onclick = e => { if (e.target === settingsModal) closeSettingsModal(); };
}

function closeSettingsModal() {
  if (settingsModal) {
    settingsModal.classList.remove("show");
    settingsModal.addEventListener("transitionend", () => settingsModal.remove(), { once: true });
    settingsModal = null;
  }
}

/**
 * Render logout button in header.
 */
export function renderLogoutButton(onLogout) {
  const header = document.querySelector("header .subtitle");
  if (!header.querySelector("#btnLogout")) {
    const btn = document.createElement("button");
    btn.id = "btnLogout";
    btn.className = "btn btn-secondary btn-sm";
    btn.textContent = "登出";
    btn.onclick = onLogout;
    header.appendChild(btn);
  }
}

/**
 * Remove logout button.
 */
export function removeLogoutButton() {
  const btn = document.querySelector("#btnLogout");
  if (btn) btn.remove();
}