/** Show an accessible, non-blocking notice when the browser loses network access. */
const banner = document.createElement("div");
banner.className = "network-status-banner";
banner.setAttribute("role", "status");
banner.setAttribute("aria-live", "polite");
banner.hidden = true;
banner.textContent = "Network connection lost. Dashboard data will refresh after connectivity is restored.";

function updateNetworkStatus() {
  const offline = navigator.onLine === false;
  banner.hidden = !offline;
  document.documentElement.toggleAttribute("data-network-offline", offline);
}

// The module is loaded at the end of body; insert before the dashboard content.
const container = document.querySelector(".container");
if (container) container.prepend(banner);
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
updateNetworkStatus();
