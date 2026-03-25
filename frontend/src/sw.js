// frontend/public/sw.js — NEW FILE (service worker)
// PWA Service Worker — caches shell + static assets
const CACHE_VERSION = 'streamix-v2'
const SHELL_ASSETS  = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
]

// Install: cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch strategy:
// - API calls: network-first (don't cache)
// - Static assets: cache-first
// - HTML pages: network-first with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, chrome-extension, etc.
  if (request.method !== 'GET') return
  if (!url.protocol.startsWith('http')) return

  // API calls — network only
  if (url.pathname.startsWith('/api/') || url.hostname.includes('railway.app') || url.hostname.includes('tmdb')) {
    return
  }

  // HTML navigation — network first, fall back to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone))
        }
        return response
      })
    })
  )
})
