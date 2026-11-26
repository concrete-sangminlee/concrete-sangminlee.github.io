const CACHE_NAME = "sequence-arena-github-pages-v128";
// Cache Storage is shared by every app on the origin (github.io user sites host several), so
// cleanup only ever touches caches this app created.
const CACHE_PREFIX = "sequence-arena-";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./client/i18n.js",
  "./client/icons.js",
  "./client/board-paint.js",
  "./client/board-render.js",
  "./client/net-client.js",
  "./client/replay-controller.js",
  "./client/sound-bank.js",
  "./client/tutorial.js",
  "./client/stats-view.js",
  "./client/touch-aim.js",
  "./shared/game-core.js",
  "./shared/bot-ai.js",
  "./shared/local-solo.js",
  "./shared/rng.js",
  "./shared/validation.js",
  "./shared/daily.js",
  "./shared/replay.js",
  "./shared/progression.js",
  "./shared/solo-modes.js",
  "./shared/analysis.js",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // cache: "reload" bypasses the HTTP cache; otherwise a new worker can precache the
      // previous deploy's still-fresh files and serve a mixed-version app after the update.
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
      // Navigation Preload: lets the browser kick off the network request for a navigation
      // (page load) in parallel with SW startup, instead of serialising "wait for SW boot →
      // SW issues fetch". Real-world impact: an extra ~80–250ms cut from LCP on returning
      // visits when the SW had been suspended. Feature-detected because not every UA ships it.
      if (self.registration && self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          // Older browsers throw on enable(); cache cleanup must still proceed.
        }
      }
      await self.clients.claim();
    })()
  );
});

const NON_CACHEABLE_PATHS = new Set([
  "/healthz",
  "/metrics",
  "/ws",
  "/client-error",
  "/csp-report",
  "/sitemap.xml",
  "/robots.txt",
  "/favicon.ico",
]);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  // Never intercept WebSocket upgrades or cross-origin fetches.
  if (request.headers.get("upgrade") === "websocket") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NON_CACHEABLE_PATHS.has(url.pathname)) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // For a navigation, the browser may have a preload already in flight. Use it instead
        // of issuing a duplicate request — this is the optimisation Navigation Preload exists
        // for. preloadResponse is undefined when the feature is unsupported or not preloaded.
        const preload = event.preloadResponse ? await event.preloadResponse : null;
        const response = preload || (await fetch(request));
        if (response && response.ok && response.type !== "opaque") {
          const copy = response.clone();
          // Navigations are stored under one key: keying by full URL kept a separate copy of
          // index.html for every distinct query string (?room=, ?mode=, ?source=).
          const cacheKey = request.mode === "navigate" ? "./index.html" : request;
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy)).catch(() => {});
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // /index.html fallback only on navigations — handing an HTML body to a
        // sub-resource request paints an unstyled page (2026-05-13 dark "all black").
        if (request.mode === "navigate") {
          return (await caches.match("./index.html")) || Response.error();
        }
        return Response.error();
      }
    })()
  );
});
