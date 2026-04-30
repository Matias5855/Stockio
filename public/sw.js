const CACHE_NAME = 'stockflow-v2'
const APP_SHELL = [
  '/dashboard',
  '/stock',
  '/ventas',
  '/finanzas',
  '/archivos',
  '/cuotas',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Cachear cada ruta como documento HTML
      for (const url of APP_SHELL) {
        try {
          const response = await fetch(url, { credentials: 'include' })
          if (response.ok) await cache.put(url, response)
        } catch {
          // Si falla una ruta, continuar con las demás
        }
      }
    })
  )
  self.skipWaiting()
})

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Nunca interceptar: Supabase, MP, APIs externas, rutas de API propias
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('mercadopago') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/static/chunks/') && url.pathname.includes('supabase')
  ) {
    return
  }

  // Solo interceptar GET
  if (request.method !== 'GET') return

  // Assets estáticos de Next.js (_next/static) → Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
          }
          return response
        })
      })
    )
    return
  }

  // Páginas de la app → Network First, fallback a cache
  if (
    url.pathname === '/' ||
    APP_SHELL.some(p => url.pathname.startsWith(p))
  ) {
    event.respondWith(
      fetch(request, { credentials: 'include' })
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
          }
          return response
        })
        .catch(() => {
          // Sin internet → servir desde cache
          return caches.match(request).then(cached => {
            if (cached) return cached
            // Fallback: servir /dashboard desde cache para cualquier ruta de la app
            return caches.match('/dashboard')
          })
        })
    )
    return
  }

  // Resto de recursos → Network First
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})

// ── MENSAJE DESDE LA APP ─────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'CACHE_URLS') {
    caches.open(CACHE_NAME).then(cache => cache.addAll(event.data.urls))
  }
})