const CACHE_NAME = "xmrig-proxy-dashboard-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./panel.png",
  "./manifest.webmanifest",
  "./icons/pwa-icon.svg",
  "./src/api.js",
  "./src/main.js",
  "./src/status.js",
  "./src/storage.js",
  "./src/theme-color.js",
  "./src/keyboard-shortcuts.js",
  "./src/manual-refresh.js",
  "./src/visibility-refresh.js",
  "./src/visible-polling.js",
  "./src/escape-html.js",
  "./src/load-average.js",
  "./src/background-upload-guard.js",
  "./src/snapshot-export.js",
  "./src/metrics-history.js",
  "./src/offline-snapshot.js",
  "./src/ui.js",
];

const scopeUrl = new URL(self.registration.scope);
const indexUrl = new URL("./index.html", scopeUrl);
const rootUrl = new URL("./", scopeUrl);
const appShellUrls = new Set(APP_SHELL.map(path => new URL(path, scopeUrl).href));

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("xmrig-proxy-dashboard-shell-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== scopeUrl.origin) return;

  // Only the app's own entry points use the offline navigation fallback.
  if (
    request.mode === "navigate" &&
    (requestUrl.pathname === rootUrl.pathname || requestUrl.pathname === indexUrl.pathname)
  ) {
    event.respondWith(
      fetch(request).catch(async () => (
        await caches.match(indexUrl.href) ||
        await caches.match(rootUrl.href) ||
        Response.error()
      )),
    );
    return;
  }

  // Deliberately do not intercept Proxy API calls or arbitrary same-origin
  // requests. Only exact, query-free app-shell URLs are eligible for caching.
  if (requestUrl.search || requestUrl.hash || !appShellUrls.has(requestUrl.href)) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    })),
  );
});
