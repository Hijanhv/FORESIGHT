/**
 * Minimal service worker — exists so Foresight is installable.
 *
 * Chrome only treats a site as installable (and only fires `beforeinstallprompt`)
 * when a service worker with a fetch handler is registered alongside the manifest.
 * Without this file the "install the app" prompt can never appear.
 *
 * Deliberately conservative: live data must not be cached. API routes and SSE
 * streams bypass the worker entirely, and everything else is network-first, so a
 * stale response can never shadow a fresh one. The cache is a pure offline
 * fallback, not a performance layer.
 */

const CACHE = "foresight-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Live odds/scores and auth must always hit the network untouched.
  if (url.pathname.startsWith("/api/")) return;
  if (req.headers.get("accept")?.includes("text/event-stream")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const cacheable =
          res.ok &&
          ["style", "script", "image", "font"].includes(req.destination);
        if (cacheable) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
