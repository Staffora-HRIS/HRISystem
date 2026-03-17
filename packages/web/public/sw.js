/// <reference lib="webworker" />

/**
 * Staffora Service Worker
 *
 * Strategy:
 * - Cache-first for static assets (JS, CSS, images, fonts)
 * - Network-first for API calls and navigation requests
 * - Stale-while-revalidate for Google Fonts
 *
 * The cache version must be bumped on each deployment so stale
 * assets are purged during the activate event.
 */

const CACHE_VERSION = "staffora-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

/** File extensions that qualify as static assets. */
const STATIC_EXTENSIONS = [
  ".js",
  ".css",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
];

/**
 * Returns true when the URL looks like a static asset that is safe
 * to serve from cache indefinitely (until the cache is busted).
 */
function isStaticAsset(url) {
  const { pathname } = new URL(url);
  return (
    pathname.startsWith("/assets/") ||
    STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))
  );
}

/**
 * Returns true for Google Fonts stylesheet or font-file requests.
 */
function isGoogleFont(url) {
  const { hostname } = new URL(url);
  return (
    hostname === "fonts.googleapis.com" || hostname === "fonts.gstatic.com"
  );
}

/**
 * Returns true for API requests that should always hit the network.
 */
function isApiRequest(url) {
  const { pathname } = new URL(url);
  return pathname.startsWith("/api/");
}

// ---------------------------------------------------------------------------
// Install — pre-cache the app shell (manifest + start URL)
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  // Activate immediately without waiting for existing clients to close.
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — clean up old caches from previous versions
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== FONT_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Start controlling all open tabs immediately.
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch — routing logic
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests; let mutations pass through.
  if (request.method !== "GET") return;

  const url = request.url;

  // --- API calls: network-first, no cache fallback -------------------------
  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // --- Google Fonts: stale-while-revalidate --------------------------------
  if (isGoogleFont(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);

          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // --- Static assets: cache-first ------------------------------------------
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;

          return fetch(request).then((response) => {
            // Only cache successful, non-opaque responses.
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // --- Navigation / HTML: network-first ------------------------------------
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || fetch(request))
      )
    );
    return;
  }
});
