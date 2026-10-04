// frontend/public/sw.js — caches the app shell for fast loads + an offline fallback.
// Downloaded videos live in IndexedDB (downloadStore.ts), not here.
const CACHE_NAME  = 'streamix-v5'
const OFFLINE_URL = '/offline.html'
const PRECACHE    = ['/', '/offline.html', '/favicon.svg', '/site.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Only handle this origin, and never API calls, stream segments or websockets
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return
  if (url.protocol === 'blob:') return

  // Navigations: network first, fall back to the cached shell, then the offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then(c => c.put('/', copy))
          return res
        })
        .catch(async () => (await caches.match('/')) || (await caches.match(OFFLINE_URL)) || new Response('Offline', { status: 503 }))
    )
    return
  }

  // Static assets: network first, cache fallback
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(request, copy))
        }
        return res
      })
      .catch(async () => (await caches.match(request)) || new Response('Offline', { status: 503 }))
  )
})

// ── Push notifications (new episodes, new library videos, weekly picks) ──────
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'Streamix', body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'Streamix', {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-64.png',
    tag: data.tag || undefined,
    data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const tab = tabs.find(t => new URL(t.url).origin === self.location.origin)
    if (tab) { await tab.focus(); return tab.navigate(url) }
    return self.clients.openWindow(url)
  })())
})
