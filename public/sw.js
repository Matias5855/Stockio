const CACHE_NAME = 'stockflow-v1'

// Archivos que se cachean al instalar
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/stock',
  '/ventas',
  '/finanzas',
  '/archivos',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// ── INSTALL: cachear assets estáticos ───────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Si algún asset falla, continuar igual
      })
    })
  )
  self.skipWaiting()
})

// ── ACTIVATE: limpiar caches viejos ─────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── FETCH: estrategia Network First con fallback a cache ─────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // No interceptar llamadas a Supabase, MP ni APIs externas
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('mercadopago.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return // Dejar pasar sin cache
  }

  // Solo cachear GET
  if (request.method !== 'GET') return

  event.respondWith(
    fetch(request)
      .then(response => {
        // Si la respuesta es válida, guardar en cache
        if (response && response.status === 200) {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone)
          })
        }
        return response
      })
      .catch(() => {
        // Sin internet → buscar en cache
        return caches.match(request).then(cached => {
          if (cached) return cached
          // Si no está en cache y es una ruta de la app, devolver el dashboard cacheado
          if (url.pathname.startsWith('/')) {
            return caches.match('/dashboard') || new Response(
              '<h1>Sin conexión</h1><p>Reconectate para continuar.</p>',
              { headers: { 'Content-Type': 'text/html' } }
            )
          }
        })
      })
  )
})

// ── SYNC: cuando vuelve internet, notificar a la app ─────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'stockflow-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_REQUIRED' })
        })
      })
    )
  }
})