'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  orgId: string
  diasRestantes?: number
  vencido?: boolean
}

export default function PaywallTrial({ orgId, diasRestantes, vencido }: Props) {
  const [plan, setPlan] = useState<'normal' | 'premium'>('normal')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const precios = { normal: 9990, premium: 19990 }
  const nombres = { normal: 'StockFlow Normal', premium: 'StockFlow Premium' }

  const suscribir = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const res = await fetch('/api/suscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan, payer_email: user.email, org_id: orgId }),
      })
      const data = await res.json()

      if (data.init_point) {
        window.location.href = data.init_point
      } else {
        setError(data.error ?? 'Error al procesar')
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,10,15,0.97)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, backdropFilter: 'blur(8px)',
    }}>
      <div style={{ width: '100%', maxWidth: 600, textAlign: 'center' }}>

        {/* Icono y título */}
        <div style={{ fontSize: 52, marginBottom: 16 }}>
          {vencido ? '🔒' : '⚡'}
        </div>
        <h2 style={{ color: '#F0EFF8', fontSize: 26, fontWeight: 800, margin: '0 0 12px' }}>
          {vencido ? 'Tu período de prueba venció' : `Te quedan ${diasRestantes} días de prueba`}
        </h2>
        <p style={{ color: '#7A7A95', fontSize: 15, margin: '0 0 32px', lineHeight: 1.6 }}>
          {vencido
            ? 'Para seguir usando StockFlow necesitás activar un plan. Todos tus datos están guardados y no se perderán.'
            : `Aprovechá para activar tu plan ahora. No se cobra hasta que termine el período de prueba.`
          }
        </p>

        {/* Selector de planes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {(['normal', 'premium'] as const).map(p => (
            <div key={p}
              onClick={() => setPlan(p)}
              style={{
                background: plan === p ? 'rgba(124,111,224,0.15)' : '#17171C',
                border: `2px solid ${plan === p ? '#7C6FE0' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12, padding: '20px 16px', cursor: 'pointer',
                transition: 'all 0.15s', textAlign: 'left',
              }}
            >
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: plan === p ? '#B4A8FF' : '#7A7A95' }}>
                {nombres[p]}
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 800, color: '#F0EFF8' }}>
                ${precios[p].toLocaleString('es-AR')}
                <span style={{ fontSize: 13, fontWeight: 400, color: '#7A7A95' }}>/mes</span>
              </p>
              {p === 'premium' && (
                <p style={{ margin: 0, fontSize: 12, color: '#7A7A95' }}>
                  Incluye usuarios ilimitados y stock compartido
                </p>
              )}
              {p === 'normal' && (
                <p style={{ margin: 0, fontSize: 12, color: '#7A7A95' }}>
                  1 usuario, funcionalidades completas
                </p>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${plan === p ? '#7C6FE0' : '#7A7A95'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {plan === p && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C6FE0' }} />}
                </div>
                <span style={{ fontSize: 12, color: plan === p ? '#7C6FE0' : '#7A7A95', fontWeight: plan === p ? 600 : 400 }}>
                  {plan === p ? 'Seleccionado' : 'Seleccionar'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Info pago */}
        <div style={{ background: 'rgba(34,201,122,0.08)', border: '1px solid rgba(34,201,122,0.15)', borderRadius: 10, padding: '12px 20px', marginBottom: 20, textAlign: 'left' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#22C97A', fontWeight: 600 }}>
            🔒 Pago seguro con Mercado Pago · Débito automático mensual · Cancelás cuando querés
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(224,85,85,0.12)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#E05555', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button onClick={suscribir} disabled={loading}
          style={{ width: '100%', background: '#7C6FE0', border: 'none', borderRadius: 10, padding: '14px', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.7 : 1, marginBottom: 12 }}>
          {loading ? 'Procesando...' : `Activar ${nombres[plan]} — $${precios[plan].toLocaleString('es-AR')}/mes`}
        </button>

        <button onClick={handleLogout}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95', fontSize: 13 }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}