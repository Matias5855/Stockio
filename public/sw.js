const CACHE_NAME = 'stockflow-v3'
const OFFLINE_PAGE = '/offline.html'

// Al instalar, cachear la página offline y assets críticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([OFFLINE_PAGE, '/icon-192.png', '/manifest.json'])
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Nunca interceptar APIs externas ni de Supabase
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('mercadopago') ||
    url.pathname.startsWith('/api/')
  ) return

  if (request.method !== 'GET') return

  // Assets estáticos de Next.js → Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()))
          return res
        })
      })
    )
    return
  }

  // Páginas de la app → Network First, fallback a offline.html
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(c => c.put(request, response.clone()))
        }
        return response
      })
      .catch(() => {
        return caches.match(request).then(cached => {
          if (cached) return cached
          // Para cualquier ruta de la app, servir offline.html
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_PAGE)
          }
        })
      })
  )
})