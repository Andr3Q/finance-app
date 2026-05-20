const CACHE_NAME = 'finance-v9'
const STATIC_ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/logo-icon.png']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('push', e => {
  const data = e.data?.json() || {}
  const title = data.title || 'FinançasPro'
  const options = {
    body:    data.body || '',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    vibrate: [100, 50, 100],
    data:    { url: data.url || '/dashboard' },
    actions: [{ action: 'open', title: 'Ver dashboard' }],
  }
  e.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/dashboard'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(url) && 'focus' in c)
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  // Assets com hash (JS/CSS do Vite): cache-first — nunca mudam com o mesmo nome
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // App shell e outras rotas: network-first, cache como fallback offline
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('/')))
  )
})
