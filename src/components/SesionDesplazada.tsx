'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { getTheme, COLORS } from '@/lib/theme'
import { syncManager } from '@/lib/sync/syncManager'
import { reclamarSesion } from '@/lib/auth/sesionUnica'

/**
 * Pantalla bloqueante del dispositivo que perdió la sesión.
 *
 * Bloquea el trabajo, pero NO cierra la sesión ni descarta nada: el token de
 * este dispositivo sigue siendo válido, así que aprovechamos para terminar de
 * subir la cola pendiente antes de que el usuario se vaya. Ese es justamente
 * el caso que se nos escapaba: alguien vendiendo offline al que le sacan la
 * sesión desde otro lado y perdía las ventas del día.
 */
export default function SesionDesplazada({
  isDark,
  onRecuperar,
  onCerrarSesion,
}: {
  isDark: boolean
  onRecuperar: () => void
  onCerrarSesion: () => void
}) {
  const t = useMemo(() => getTheme(isDark), [isDark])
  const [pendientes, setPendientes] = useState<number | null>(null)
  const [recuperando, setRecuperando] = useState(false)

  useEffect(() => {
    let vivo = true
    const refrescar = () => {
      syncManager.contarPendientes().then(n => { if (vivo) setPendientes(n) })
    }
    // Intentamos vaciar la cola ahora, mientras el token todavía sirve.
    syncManager.sync().finally(refrescar)
    refrescar()
    window.addEventListener('syncCompleted', refrescar)
    return () => { vivo = false; window.removeEventListener('syncCompleted', refrescar) }
  }, [])

  const handleRecuperar = useCallback(async () => {
    setRecuperando(true)
    await reclamarSesion()
    onRecuperar()
  }, [onRecuperar])

  const btnBase: React.CSSProperties = {
    borderRadius: 10, padding: '12px 18px', fontSize: 14,
    fontWeight: 700, cursor: 'pointer', border: 'none', width: '100%',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: t.bg, color: t.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background: t.card, border: `1px solid ${t.borderCard}`,
        borderRadius: 16, padding: 32, maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: isDark ? '0 8px 40px rgba(0,0,0,0.5)' : '0 12px 32px rgba(4,47,46,0.12)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>📱</div>

        <p style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>
          Tu cuenta se abrió en otro dispositivo
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: t.textMuted, lineHeight: 1.55 }}>
          Stockio permite un solo dispositivo por cuenta a la vez. Si alguien más
          necesita usar el sistema, tiene que tener su propia cuenta.
        </p>

        {/* Estado de la cola: es lo primero que va a querer saber alguien que
            estuvo vendiendo sin conexión. */}
        <div style={{
          background: pendientes === 0
            ? (isDark ? 'rgba(34,201,122,0.10)' : '#ECFDF5')
            : (isDark ? 'rgba(224,160,48,0.10)' : '#FEF3C7'),
          border: `1px solid ${pendientes === 0 ? (isDark ? 'rgba(34,201,122,0.35)' : '#A7F3D0') : (isDark ? 'rgba(224,160,48,0.35)' : '#FDE68A')}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 20,
          fontSize: 13, lineHeight: 1.5, color: t.text, textAlign: 'left',
        }}>
          {pendientes === null && 'Revisando si quedaron cambios sin subir…'}
          {pendientes === 0 && '✓ Todos tus cambios están guardados en el servidor.'}
          {pendientes !== null && pendientes > 0 && (
            <>
              <strong>{pendientes} cambio{pendientes > 1 ? 's' : ''} sin subir todavía.</strong>{' '}
              No se pierden: quedan guardados en este dispositivo y se suben cuando
              vuelvas a usar Stockio acá.
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleRecuperar}
            disabled={recuperando}
            style={{
              ...btnBase,
              background: COLORS.primary, color: '#FFFFFF',
              opacity: recuperando ? 0.7 : 1,
              boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
            }}
          >
            {recuperando ? 'Recuperando…' : 'Usar en este dispositivo'}
          </button>
          <button
            onClick={onCerrarSesion}
            style={{ ...btnBase, background: 'transparent', color: t.textMuted, border: `1px solid ${t.borderCard}` }}
          >
            Cerrar sesión
          </button>
        </div>

        <p style={{ margin: '16px 0 0', fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
          Si usás &quot;Usar en este dispositivo&quot;, el otro queda bloqueado.
        </p>
      </div>
    </div>
  )
}
