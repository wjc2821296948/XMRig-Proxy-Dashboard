/**
 * Progressive Web App enhancement.
 *
 * Registration is best-effort: the dashboard remains fully usable on hosts
 * that do not support service workers or when opened outside a secure context.
 */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL("../sw.js", import.meta.url);
    navigator.serviceWorker.register(serviceWorkerUrl, { scope: new URL("../", import.meta.url).pathname })
      .catch(error => {
        // Do not log URLs, credentials, or configuration when registration fails.
        console.warn("Offline support could not be enabled.", error?.name || "Error");
      });
  }, { once: true });
}


// Notify an already-open dashboard when a newly activated worker takes control.
// The first installation is intentionally silent; only updates to an existing
// controlled page need a reload prompt.
if ("serviceWorker" in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }

    const notice = document.createElement("div");
    notice.className = "pwa-update-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    const message = document.createElement("span");
    message.textContent = "A dashboard update is ready.";
    const reload = document.createElement("button");
    reload.type = "button";
    reload.className = "btn btn-secondary btn-sm";
    reload.textContent = "Reload now";
    reload.addEventListener("click", () => window.location.reload(), { once: true });
    notice.append(message, reload);
    document.querySelector(".container")?.prepend(notice);
  });
}
