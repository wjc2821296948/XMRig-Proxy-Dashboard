/**
 * ui.js – UI utilities and rendering functions.
 *
 * Provides:
 *  - Toast notifications
 *  - Skeleton loading placeholders
 *  - Formatting utilities (hashrate, bytes, uptime, numbers)
 *  - Status classification helpers
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