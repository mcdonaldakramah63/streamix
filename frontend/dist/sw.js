// This service worker unregisters itself and clears all caches
// Fixes the infinite loading caused by the previous broken service worker

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Delete ALL caches
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))),
      // Unregister this service worker
      self.registration.unregister(),
    ])
  )
})

// Pass ALL requests through — no interception
self.addEventListener('fetch', () => {})
