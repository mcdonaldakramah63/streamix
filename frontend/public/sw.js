// frontend/public/sw.js — FULL REPLACEMENT
// Caches static app shell for instant load + offline fallback
// Video blobs are stored in IndexedDB by downloadStore.ts (not here)

const CACHE_NAME = 'streamix-v3'
const OFFLINE_URL = '/offline.html'

const PRECACHE = [
  '/',
  '/offline.html',
]

// ── Install: precache app shell ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).catch(() => {})
  )
  self.skipWaiting()
})

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // ── Skip non-GET, cross-origin API calls, video streams ──────────────────
  if (request.method !== 'GET') return
  if (url.hostname.includes('railway.app')) return      // backend API
  if (url.hostname.includes('tmdb.org')) return         // images — let network handle
  if (url.pathname.includes('/stream/'))  return        // video streams
  if (url.pathname.includes('/ws'))       return        // websockets

  // ── App shell: network-first, fall back to cache ─────────────────────────
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          if (cached) return cached
          // For navigation requests, return the app shell
          if (request.mode === 'navigate') {
            return caches.match('/') || caches.match(OFFLINE_URL) || new Response('Offline', { status: 503 })
          }
          return new Response('Offline', { status: 503 })
        })
    )
    return
  }
})

// ── Background sync: queue failed API calls when offline ─────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-watchlist') {
    // Handled by the app when it comes back online
    console.log('[SW] Background sync: watchlist')
  }
})
