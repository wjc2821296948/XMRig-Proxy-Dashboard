const CACHE_NAME = "xmrig-dashboard-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./app-icon.svg",
  "./app-icon-192.png",
  "./app-icon-512.png",
  "./panel.png",
  "./src/main.js",
  "./src/api.js",
  "./src/manual-refresh.js",
  "./src/visibility-refresh.js",
  "./src/visible-polling.js",
  "./src/storage.js",
  "./src/ui.js",
  "./src/status.js",
  "./src/escape-html.js",
  "./src/load-average.js",
  "./src/background-upload-guard.js",
  "./src/snapshot-export.js",
  "./src/theme-color.js",
  "./src/keyboard-shortcuts.js",
  "./src/pwa.js",
];

const scopedUrl = path => new URL(path, self.registration.scope).href;
const APP_SHELL_URLS = APP_SHELL.map(scopedUrl);
const INDEX_URL = scopedUrl("./index.html");

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("xmrig-dashboard-shell-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isCacheableStaticRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  // Never cache Proxy API responses or requests carrying credentials.
  if (/^\/(?:\d+\/|api\/)/i.test(url.pathname) || request.headers.has("authorization")) return false;
  return /\.(?:css|js|mjs|png|svg|webp|woff2?|ttf|webmanifest)$/i.test(url.pathname)
    || url.pathname.endsWith("/index.html")
    || url.pathname.endsWith("/");
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (!isCacheableStaticRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(INDEX_URL, response.clone());
          } catch {
            // A cache quota or browser storage failure must not break navigation.
          }
        }
        return response;
      } catch {
        return (await caches.match(INDEX_URL)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        } catch {
          // Return the network response even when caching is unavailable.
        }
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
