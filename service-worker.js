/* service-worker.js — Corridor Hill offline shell (Week-1 PWA).
 * Cache-first for same-origin GET page/shell assets; network-first for
 * /api/* (never cached). Falls back to offline.html when offline.
 */
const CACHE = "corridor-v5";
const SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./register.html",
  "./choose-room.html",
  "./dashboard.html",
  "./complaint.html",
  "./tracking.html",
  "./rules.html",
  "./management.html",
  "./offline.html",
  "./css/style.css",
  "./css/auth.css",
  "./css/forms.css",
  "./css/dashboard.css",
  "./css/management.css",
  "./css/responsive.css",
  "./js/config.js",
  "./manifest.webmanifest",
  "./favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never cache API traffic.
  if (url.pathname.startsWith("/api/")) return;
  // Only handle same-origin shell requests.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        }).catch(() => caches.match("./offline.html"))
    )
  );
});
