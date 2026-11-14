const CACHE_PREFIX = "xmrig-proxy-dashboard-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
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
  "./src/i18n.js",
  "./src/network-status.js",
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

/**
 * Cache reads are an optimization, not a prerequisite for serving the app.
 * A disabled or unavailable CacheStorage must therefore behave like a miss.
 */
async function matchCacheBestEffort(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(request);
  } catch {
    return undefined;
  }
}

/** A failed cache write must never discard a successful network response. */
async function putCacheBestEffort(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch {
    // Keep the network response usable when persistent storage is unavailable.
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    // Keep installation atomic: a missing app-shell asset must fail the update
    // rather than activate a worker that cannot serve the offline application.
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(async key => {
          try {
            await caches.delete(key);
          } catch {
            // An old cache that cannot be deleted must not prevent this worker
            // from taking control of the current page.
          }
        }));
    } catch {
      // Cache enumeration is best-effort; claiming clients is still useful.
    }
    await self.clients.claim();
  })());
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
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cachedIndex = await matchCacheBestEffort(indexUrl.href);
        if (cachedIndex) return cachedIndex;
        const cachedRoot = await matchCacheBestEffort(rootUrl.href);
        return cachedRoot || Response.error();
      }
    })());
    return;
  }

  // Proxy API calls, query-bearing URLs, and arbitrary same-origin resources
  // are deliberately excluded. Only exact app-shell URLs use this strategy.
  if (requestUrl.search || requestUrl.hash || !appShellUrls.has(requestUrl.href)) return;

  event.respondWith((async () => {
    const cached = await matchCacheBestEffort(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await putCacheBestEffort(request, response.clone());
    }
    return response;
  })());
});
