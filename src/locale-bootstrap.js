/* Synchronous locale detection runs before the page is painted. Keep this
 * dependency-free and compatible with the document's self-only script CSP. */
(() => {
  let locale = "zh-CN";
  try {
    const stored = globalThis.localStorage?.getItem("dashboard_locale");
    if (typeof stored === "string") {
      const normalized = stored.trim().toLowerCase();
      if (normalized === "en" || normalized.startsWith("en-")) locale = "en";
    }
  } catch {
    // Storage may be disabled; use the default Chinese locale.
  }
  const root = document.documentElement;
  root.lang = locale;
  root.dataset.locale = locale;
  if (locale === "en") document.title = "XMRig Proxy Dashboard";
})();
