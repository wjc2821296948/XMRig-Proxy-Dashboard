const CACHE_NAME = "xmrig-dashboard-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
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
  // Never cache Proxy API responses, or requests carrying credentials.
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
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
