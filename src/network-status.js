import { translate } from "./i18n.js";

/** Show an accessible notice for the browser's reported offline state only. */
const banner = document.createElement("div");
banner.className = "network-status-banner";
banner.setAttribute("role", "status");
banner.setAttribute("aria-live", "polite");
banner.hidden = true;
banner.textContent = "Your browser reports that it is offline. This does not indicate whether the Proxy API is reachable.";

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
