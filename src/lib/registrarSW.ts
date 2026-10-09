'use client'
/**
 * Registro del service worker (public/sw.js) y precarga de las secciones.
 *
 * EL SERVICE WORKER NO ESTUVO REGISTRADO ENTRE ABRIL Y OCTUBRE DE 2026. El
 * archivo que lo registraba (src/app/sw-register.tsx) se borró en el commit
 * 57ff1b4 al mover el cartel de "Sin conexión" al layout, y el registro se
 * perdió de rebote. public/sw.js siguió en el repo sin que nada lo cargara.
 * Consecuencia: recargar sin señal mostraba el error del navegador, y abrir sin
 * señal una sección no visitada antes también, porque su código no estaba.
 *
 * LA PRECARGA. Cada sección es un archivo aparte que se baja la primera vez que
 * se abre (next/dynamic). Sin precargar, el offline solo funcionaría en las
 * secciones que el usuario ya hubiera abierto con conexión. Con conexión y la
 * pantalla quieta, se piden todas: el service worker las guarda y quedan
 * disponibles sin señal.
 */
export function registrarServiceWorker(precargar: Array<() => Promise<unknown>>) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  // En desarrollo el SW cachearía los bundles de Turbopack y confundiría.
  if (process.env.NODE_ENV !== 'production') return

  navigator.serviceWorker
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then(reg => reg.update())
    .catch(err => console.error('[SW] No se pudo registrar:', err))

  if (!navigator.onLine) return

  const cuandoEsteQuieto = (fn: () => void) =>
    'requestIdleCallback' in window
      ? (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(fn)
      : setTimeout(fn, 3000)

  cuandoEsteQuieto(() => {
    // De a una y sin apuro: es para tenerlas guardadas, no para mostrarlas ya.
    precargar.reduce<Promise<unknown>>(
      (cadena, cargar) => cadena.then(() => cargar().catch(() => {})),
      Promise.resolve(),
    )
  })
}
