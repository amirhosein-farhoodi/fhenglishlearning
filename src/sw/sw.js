/* Service worker for the installed app (and every browser that supports one).
 *
 * Built by the `serviceWorker` plugin in vite.config.ts, which fills in
 * __VERSION__ and __PRECACHE__ and writes the result to dist/sw.js. Plain JS on
 * purpose: it runs in the worker scope, outside the app bundle.
 *
 * Strategy
 * - Install: cache the app shell (index.html, the entry JS/CSS, page chunks,
 *   icons) so the app opens offline.
 * - Page loads: network first, falling back to the cached shell offline.
 * - /assets/*: cache first. Vite fingerprints every filename, so a cached copy
 *   can never be stale. Lessons are cached the first time they are opened,
 *   rather than downloading all ~8 MB of content up front.
 * - Covers, icons, Google Fonts: served from cache, refreshed in the background.
 * - Everything else (Supabase, wallets, audio, other sites) goes straight to the
 *   network, untouched.
 *
 * A new version waits until the app asks it to take over (see src/lib/pwa.ts),
 * so a deploy never swaps code under someone in the middle of a quiz.
 */

const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__

const SHELL = `shell-${VERSION}`
const RUNTIME = 'runtime-v1'
/** Lessons are small; this keeps a heavy learner's cache to a few MB. */
const RUNTIME_MAX = 600

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

async function trim(cache) {
  const keys = await cache.keys()
  // Oldest first: Cache keeps insertion order.
  for (let i = 0; i < keys.length - RUNTIME_MAX; i++) await cache.delete(keys[i])
}

async function put(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return
  const cache = await caches.open(RUNTIME)
  await cache.put(request, response)
  void trim(cache)
}

async function cacheFirst(request) {
  const hit = await caches.match(request)
  if (hit) return hit
  const res = await fetch(request)
  void put(request, res.clone())
  return res
}

async function staleWhileRevalidate(event) {
  const hit = await caches.match(event.request)
  const refresh = fetch(event.request)
    .then((res) => {
      void put(event.request, res.clone())
      return res
    })
    .catch(() => hit)
  if (hit) {
    event.waitUntil(refresh.catch(() => {}))
    return hit
  }
  return refresh
}

async function page(request) {
  try {
    return await fetch(request)
  } catch {
    // Offline: every route is the same single-page app.
    return (await caches.match('/index.html', { cacheName: SHELL })) ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  // Media is streamed with Range requests; caching those half-responses breaks playback.
  if (request.headers.has('range') || request.destination === 'audio' || request.destination === 'video') return

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) {
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      event.respondWith(staleWhileRevalidate(event))
    }
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(page(request))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (url.pathname === '/sw.js') return
  event.respondWith(staleWhileRevalidate(event))
})
