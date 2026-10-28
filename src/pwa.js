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
