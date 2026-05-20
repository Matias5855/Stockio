'use client'
/**
 * Paywall — pantalla bloqueante cuando la suscripcion no esta activa.
 *
 * Se muestra cuando estado ∈ {vencida, cancelada, pausada} o cuando
 * estado === trial y la fecha de fin ya paso (a veces el webhook tarda
 * en correr y queda en trial vencido).
 *
 * No se puede cerrar — el usuario debe pagar o cerrar sesion.
 */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { COLORS } from '@/lib/theme'

export type EstadoSuscripcion = 'trial' | 'activa' | 'vencida' | 'cancelada' | 'pausada'

interface Props {
  estado: EstadoSuscripcion
  planId: 'normal' | 'premium' | string
  email?: string
}

const PLAN_INFO = {
  normal:   { nombre: 'Stockio Normal',  precio: 14990 },
  premium:  { nombre: 'Stockio Premium', precio: 24990 },
} as const

export default function Paywall({ estado, planId, email }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = PLAN_INFO[planId as 'normal' | 'premium'] ?? PLAN_INFO.normal

  const titulo =
    estado === 'cancelada' ? 'Suscripción cancelada' :
    estado === 'pausada'   ? 'Suscripción pausada' :
                             'Suscripción vencida'

  const mensaje =
    estado === 'cancelada'
      ? 'Cancelaste tu suscripción a Stockio. Para volver a usar la app, reactivá tu plan.'
      : estado === 'pausada'
      ? 'Tu suscripción está pausada. Reactivá el pago automático para volver a usar Stockio.'
      : 'Tu período de prueba terminó o el cobro automático falló. Para seguir usando Stockio, regularizá el pago.'

  const pagar = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/suscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId === 'premium' ? 'premium' : 'normal', payer_email: email ?? '' }),
      })
      const data = await res.json()
      if (data.init_point) {
        window.location.href = data.init_point
      } else {
        setError(data.error ?? 'No pudimos generar el link de pago. Probá de nuevo en unos minutos.')
        setLoading(false)
      }
    } catch {
      setError('Error de conexión. Probá de nuevo.')
      setLoading(false)
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'linear-gradient(160deg, #042F2E 0%, #0D9488 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 16, padding: 40,
        width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: '#FFF1F2', color: '#9F1239',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, margin: '0 auto 16px',
        }}>
          🔒
        </div>

        <h1 style={{
          color: '#042F2E', fontSize: 24, fontWeight: 800,
          margin: '0 0 10px', letterSpacing: '-0.02em',
        }}>
          {titulo}
        </h1>

        <p style={{
          color: '#1C4542', fontSize: 14, lineHeight: 1.6,
          margin: '0 0 24px',
        }}>
          {mensaje}
        </p>

        {/* Detalle del plan */}
        <div style={{
          background: '#F0FDFA', border: '1px solid #CCFBF1',
          borderRadius: 12, padding: '16px 20px', marginBottom: 24,
          textAlign: 'left',
        }}>
          <p style={{
            margin: '0 0 4px', fontSize: 11, color: '#6B7280',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Tu plan
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#042F2E' }}>
              {plan.nombre}
            </p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLORS.primary }}>
              ${plan.precio.toLocaleString('es-AR')}<span style={{ fontSize: 12, fontWeight: 500, color: '#6B7280' }}>/mes</span>
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            background: '#FFF1F2', color: '#9F1239', border: '1px solid #FECDD3',
            borderRadius: 8, padding: '10px 14px', marginBottom: 14,
            fontSize: 13, textAlign: 'left',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={pagar}
          disabled={loading}
          style={{
            width: '100%', background: COLORS.primary, color: '#fff',
            border: 'none', borderRadius: 10, padding: '14px',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
            boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
            marginBottom: 12,
          }}
        >
          {loading ? 'Generando link…' : '💳 Pagar y reactivar'}
        </button>

        <button
          onClick={cerrarSesion}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6B7280', fontSize: 13, fontWeight: 500,
            padding: 8,
          }}
        >
          Cerrar sesión
        </button>

        <p style={{
          margin: '20px 0 0', fontSize: 11, color: '#9CA3AF',
          lineHeight: 1.5,
        }}>
          Si tenés algún problema con el pago, escribinos por WhatsApp y te ayudamos.
        </p>
      </div>
    </div>
  )
}

/**
 * Banner amarillo que se muestra arriba del contenido cuando el trial
 * esta por vencer (menos de 7 dias). NO bloquea — solo avisa.
 */
export function TrialBanner({ diasRestantes, onPagar }: { diasRestantes: number; onPagar: () => void }) {
  return (
    <div style={{
      background: '#FEF3C7', color: '#92400E',
      borderBottom: '1px solid #FCD34D',
      padding: '10px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 16, fontSize: 13, fontWeight: 600,
      flexWrap: 'wrap',
    }}>
      <span>
        ⏰ Te quedan <strong>{diasRestantes} día{diasRestantes !== 1 ? 's' : ''}</strong> de prueba gratuita.
        El primer cobro es el día 31.
      </span>
      <button
        onClick={onPagar}
        style={{
          background: '#92400E', color: '#FEF3C7', border: 'none',
          borderRadius: 6, padding: '5px 14px', cursor: 'pointer',
          fontSize: 12, fontWeight: 700,
        }}
      >
        Ver mi plan →
      </button>
    </div>
  )
}
