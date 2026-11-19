/* Synchronous locale detection runs before the page is painted. Keep this
 * dependency-free and compatible with the document's self-only script CSP. */
(() => {
  let locale = "zh-CN";
  for (const storageName of ["localStorage", "sessionStorage"]) {
    try {
      const storage = globalThis[storageName];
      const stored = storage?.getItem("dashboard_locale");
      if (typeof stored !== "string") continue;
      const normalized = stored.trim().toLowerCase();
      if (normalized === "en" || normalized.startsWith("en-")) locale = "en";
      else if (normalized === "zh" || normalized.startsWith("zh-")) locale = "zh-CN";
      else continue;
      break;
    } catch {
      // Try the other storage area when this one is unavailable.
    }
  }
  const root = document.documentElement;
  root.lang = locale;
  root.dataset.locale = locale;
  if (locale === "en") document.title = "XMRig Proxy Dashboard";
})();
