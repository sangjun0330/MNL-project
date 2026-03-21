/* RNest service worker: keep only a tiny shell cache to avoid stale Next chunks after deploy */
const CACHE = "rnest-cache-v6";
const CORE = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/rnest-logo.png",
];

function isShellAsset(pathname) {
  return (
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/rnest-logo.png" ||
    pathname.startsWith("/icons/")
  );
}

function shouldCache(response) {
  return Boolean(response && response.ok && (response.type === "basic" || response.type === "default"));
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => (key === CACHE ? null : caches.delete(key)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Never intercept API, page navigations, or Next build assets.
  // Next already serves immutable chunk files; SW caching here causes stale chunk mismatches after deploy.
  if (url.pathname.startsWith("/api/") || req.mode === "navigate" || url.pathname.startsWith("/_next/")) {
    return;
  }

  if (!isShellAsset(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (shouldCache(response)) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return response;
      });
    })
  );
});
