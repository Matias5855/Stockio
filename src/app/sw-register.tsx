'use client'
import { useEffect } from 'react'
import { syncManager } from '@/lib/sync/syncManager'

export default function SWRegister() {
  useEffect(() => {
    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(reg => {
          console.log('[SW] Registrado correctamente:', reg.scope)
          // Forzar actualización si hay una versión nueva
          reg.update()
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })

          // Escuchar mensajes del SW (ej: cuando vuelve internet)
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'SYNC_REQUIRED') {
              syncManager.sync()
            }
          })
        })
        .catch(err => console.error('[SW] Error al registrar:', err))
    }

    // Detectar cambios de conectividad y mostrar banner
    const onOnline = () => {
      syncManager.sync()
      const banner = document.getElementById('offline-banner')
      if (banner) banner.style.display = 'none'
    }

    const onOffline = () => {
      const banner = document.getElementById('offline-banner')
      if (banner) banner.style.display = 'flex'
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <div
      id="offline-banner"
      style={{
        display: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#E0A030',
        color: '#000',
        padding: '10px 20px',
        fontSize: 13,
        fontWeight: 600,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      ⚠ Sin conexión — los cambios se guardan localmente y se sincronizarán al reconectarte
    </div>
  )
}