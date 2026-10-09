// v4: vuelve a registrarse (ver src/lib/registrarSW.ts) despues de estar
// desconectado desde abril. Subir la version descarta lo que haya quedado de
// la v3 en navegadores que la tuvieran instalada.
//
// OJO al tocar este archivo: un service worker roto puede dejar la app
// trabada en una version vieja para quien ya lo tiene instalado. Las paginas
// van "network first" a proposito: con conexion siempre se baja la version
// nueva, y el cache solo entra cuando no hay red.
const CACHE_NAME = 'stockflow-v4'
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

  // El clone() tiene que ser SINCRONICO, antes de devolver la respuesta.
  // Antes se clonaba adentro del .then de caches.open(): para ese momento el
  // navegador ya podia estar leyendo el cuerpo, clone() fallaba con "body
  // already used" y la respuesta no quedaba guardada. El offline dependia de
  // ganar esa carrera.
  //
  // Tampoco se guarda una respuesta que vino de una redireccion: si /dashboard
  // redirigio al login (sesion vencida), se guardaria el login con la clave de
  // /dashboard y sin conexion se serviria eso en vez de la app.
  const guardar = (req, res) => {
    if (!res.ok || res.redirected) return
    const copia = res.clone()
    caches.open(CACHE_NAME).then(c => c.put(req, copia))
  }

  // Assets estáticos de Next.js → Cache First. Tienen hash en el nombre, así
  // que un archivo cacheado nunca queda viejo: cada deploy pide otros nombres.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          guardar(request, res)
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
        guardar(request, response)
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