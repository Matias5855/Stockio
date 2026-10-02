'use client'
import { useEffect } from 'react'
import { syncManager } from '@/lib/sync/syncManager'

/**
 * Aviso de que la cuenta se abrió en otro dispositivo.
 *
 * Fue una pantalla BLOQUEANTE (fase 1.4.D): tapaba toda la app para que
 * compartir usuario entre dos personas fuera impráctico. Por decisión del dueño
 * (2026-10-02) pasó a ser un aviso que se cierra: bloquear terminaba molestando
 * al cliente legítimo — el que abre Stockio en el celular y vuelve a la compu.
 *
 * Lo que se resigna, dicho claro: esto ya NO impide que dos personas usen la
 * misma cuenta a la vez. Avisa, no frena. Si más adelante hace falta frenar de
 * nuevo, el mecanismo de detección (src/lib/auth/sesionUnica.ts) sigue intacto
 * y alcanza con volver a bloquear acá.
 *
 * Sale solo en el dispositivo que quedó atrás, nunca en el que acaba de entrar.
 */
export default function SesionDesplazada({ onCerrar }: { onCerrar: () => void }) {
  // Se aprovecha para subir lo pendiente: es el caso de alguien que estuvo
  // vendiendo sin conexión en este equipo mientras la cuenta se abría en otro.
  useEffect(() => { syncManager.sync() }, [])

  return (
    <div style={{
      background: '#334155', color: '#FFFFFF', padding: '8px 20px',
      fontSize: 13, fontWeight: 500, flexShrink: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <span style={{ textAlign: 'center' }}>
        📱 Tu cuenta se abrió en otro dispositivo. Si no fuiste vos, cambiá la contraseña.
      </span>
      <button
        onClick={onCerrar}
        aria-label="Cerrar aviso"
        style={{
          background: 'none', border: 'none', color: '#FFFFFF',
          fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '0 4px', opacity: 0.85,
        }}
      >
        ×
      </button>
    </div>
  )
}
