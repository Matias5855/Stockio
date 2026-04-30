'use client'
import { useEffect, useState } from 'react'
import { syncManager } from '@/lib/sync/syncManager'

export default function SWRegister() {
  const [isOffline, setIsOffline] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    // Registrar SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(reg => {
          reg.update()
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        })
        .catch(err => console.error('[SW] Error:', err))
    }

    // Estado inicial
    setIsOffline(!navigator.onLine)

    const onOnline = async () => {
      setIsOffline(false)
      await syncManager.sync()
      setPendingCount(0)
    }

    const onOffline = () => {
      setIsOffline(true)
      checkPending()
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const checkPending = async () => {
    try {
      const { getPendingSync } = await import('@/lib/db/indexeddb')
      const pending = await getPendingSync()
      setPendingCount(pending.length)
    } catch {}
  }

  if (!isOffline) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 9999,
      background: '#E0A030',
      color: '#000',
      padding: '10px 20px',
      fontSize: 13,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    }}>
      ⚠ Sin conexión — los cambios se guardan localmente y se sincronizan al reconectarte
      {pendingCount > 0 && (
        <span style={{
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 100,
          padding: '2px 10px',
          fontSize: 12,
        }}>
          {pendingCount} pendientes
        </span>
      )}
    </div>
  )
}