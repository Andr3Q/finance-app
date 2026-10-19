const CACHE_VERSION = '__BUILD_TS__'
const CACHE_NAME = `finance-${CACHE_VERSION}`
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
  const title = data.title || 'Nancy'
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
  const rawUrl = e.notification.data?.url || '/dashboard'
  // Valida que a URL pertence à mesma origem — impede phishing via payload push.
  const safeUrl = (() => {
    try {
      const parsed = new URL(rawUrl, self.location.origin)
      return parsed.origin === self.location.origin ? parsed.href : '/dashboard'
    } catch { return '/dashboard' }
  })()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(safeUrl) && 'focus' in c)
      if (existing) return existing.focus()
      return clients.openWindow(safeUrl)
    })
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Requisição de terceiros (ex.: Google Fonts): deixa passar direto pro
  // navegador. Sem isso, uma falha de rede caía no fallback abaixo e
  // servia o app shell cacheado (HTML) como se fosse a resposta — por
  // exemplo, um CSS de fonte "virava" HTML e o navegador rejeitava por
  // MIME type errado.
  if (url.origin !== self.location.origin) return

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
