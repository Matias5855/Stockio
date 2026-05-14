'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { COLORS } from '@/lib/theme'

const PLANES = {
  normal: {
    nombre: 'StockFlow Normal',
    precio: 9990,
    descripcion: 'Para negocios que quieren ordenarse',
    features: ['1 usuario', 'Productos ilimitados', 'Ventas y facturación', 'Escáner de código de barras', 'Cuotas y créditos', 'Facturación ARCA', '10 GB archivos'],
  },
  premium: {
    nombre: 'StockFlow Premium',
    precio: 19990,
    descripcion: 'Para negocios con empleados',
    features: ['Usuarios ilimitados', 'Stock compartido en tiempo real', 'Roles por empleado', 'Todo lo del plan Normal', 'Múltiples sucursales', '50 GB archivos', 'Soporte prioritario'],
  },
} as const

type Step = 'plan' | 'datos' | 'pago' | 'procesando'

const PAGE_BG: React.CSSProperties = {
  minHeight: '100vh',
  background: '#F0FDFA',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '32px 20px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const BRAND_HEADER = (
  <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 28 }}>
    <div style={{ width: 36, height: 36, background: COLORS.primary, color: '#FFFFFF', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>S</div>
    <span style={{ color: '#042F2E', fontWeight: 800, fontSize: 22 }}>StockFlow</span>
  </Link>
)

export default function RegisterPage() {
  const supabase = createClient()
  const router = useRouter()
  const [step, setStep] = useState<Step>('plan')
  const [plan, setPlan] = useState<'normal' | 'premium'>('normal')
  const [form, setForm] = useState({ nombre: '', negocio: '', email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get('plan') as 'normal' | 'premium'
    if (p && PLANES[p]) { setPlan(p); setStep('datos') }
    const nombre  = params.get('nombre')
    const negocio = params.get('negocio')
    const email   = params.get('email')
    const password = params.get('password')
    if (nombre || negocio || email) {
      setForm(f => ({
        nombre:   nombre   ?? f.nombre,
        negocio:  negocio  ?? f.negocio,
        email:    email    ?? f.email,
        password: password ?? f.password,
      }))
      if (nombre || negocio || email) setStep('datos')
    }
  }, [])

  const planData = PLANES[plan]

  const inp: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #CCFBF1',
    borderRadius: 10,
    padding: '12px 14px',
    color: '#1C4542',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const cardCommon: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #CCFBF1',
    borderRadius: 16,
    padding: 36,
    width: '100%',
    boxShadow: '0 4px 24px rgba(4,47,46,0.06)',
  }

  // ── STEP 1: Elegir plan ───────────────────────────────────
  if (step === 'plan') {
    return (
      <div style={PAGE_BG}>
        {BRAND_HEADER}

        <h1 style={{ color: '#042F2E', fontWeight: 800, fontSize: 30, margin: '0 0 8px', textAlign: 'center', letterSpacing: '-0.02em' }}>
          Elegí tu plan
        </h1>
        <p style={{ color: '#1C4542', margin: '0 0 40px', fontSize: 15, textAlign: 'center' }}>
          <strong style={{ color: COLORS.success }}>30 días gratis</strong>, sin cargo hasta el día 31
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, width: '100%', maxWidth: 720 }}>
          {(Object.entries(PLANES) as [keyof typeof PLANES, typeof PLANES.normal][]).map(([key, p]) => {
            const isPopular = key === 'premium'
            return (
              <div key={key}
                onClick={() => { setPlan(key); setStep('datos') }}
                style={{
                  background: '#FFFFFF',
                  border: `2px solid ${isPopular ? COLORS.primary : '#CCFBF1'}`,
                  borderRadius: 16, padding: 28, cursor: 'pointer',
                  transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
                  position: 'relative',
                  boxShadow: isPopular ? '0 8px 24px rgba(13,148,136,0.12)' : 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                {isPopular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: COLORS.primary, color: '#FFFFFF', borderRadius: 100,
                    padding: '4px 14px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  }}>
                    ⭐ MÁS POPULAR
                  </div>
                )}
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.nombre}</p>
                <p style={{ margin: '0 0 4px', fontSize: 34, fontWeight: 800, color: '#042F2E' }}>
                  ${p.precio.toLocaleString('es-AR')}
                  <span style={{ fontSize: 14, fontWeight: 400, color: '#6B7280' }}>/mes</span>
                </p>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6B7280' }}>{p.descripcion}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ fontSize: 13, color: '#1C4542', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: COLORS.success, fontWeight: 700 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <div style={{ background: COLORS.primary, borderRadius: 10, padding: '12px', textAlign: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                  Empezar 30 días gratis →
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
                  No se cobra nada hasta el día 31.
                </p>
              </div>
            )
          })}
        </div>

        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 28 }}>
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" style={{ color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
            Iniciar sesión
          </Link>
        </p>
      </div>
    )
  }

  // ── STEP 2: Datos de la cuenta ────────────────────────────
  if (step === 'datos') {
    const validar = () => {
      if (!form.nombre || !form.negocio || !form.email || !form.password) {
        setError('Completá todos los campos'); return false
      }
      if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return false }
      setError(null)
      return true
    }

    return (
      <div style={{ ...PAGE_BG, justifyContent: 'center' }}>
        <div style={{ ...cardCommon, maxWidth: 440 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h1 style={{ color: '#042F2E', fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: '-0.02em' }}>Creá tu cuenta</h1>
              <p style={{ color: '#6B7280', margin: '2px 0 0', fontSize: 13 }}>Paso 1 de 2 — Tus datos</p>
            </div>
            <div style={{
              background: '#CCFBF1',
              border: `1px solid ${COLORS.primary}`,
              borderRadius: 8, padding: '6px 12px', textAlign: 'right',
            }}>
              <p style={{ margin: 0, fontSize: 10, color: '#115E59', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#042F2E' }}>{planData.nombre.replace('StockFlow ', '')}</p>
            </div>
          </div>

          {/* Indicador de pasos */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: COLORS.primary }} />
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#CCFBF1' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'nombre',  placeholder: 'Tu nombre completo', type: 'text' },
              { key: 'negocio', placeholder: 'Nombre de tu negocio', type: 'text' },
              { key: 'email',   placeholder: 'Email', type: 'email' },
            ].map(f => (
              <input key={f.key} type={f.type} placeholder={f.placeholder}
                value={form[f.key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={inp}
              />
            ))}

            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} placeholder="Contraseña (mín. 6 caracteres)"
                value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                style={{ ...inp, paddingRight: 44 }}
              />
              <button onClick={() => setShowPass(v => !v)} tabIndex={-1}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 6 }}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>

            {error && (
              <div style={{ background: '#FFF1F2', color: '#9F1239', border: '1px solid #FECDD3', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
                {error}
              </div>
            )}

            <button onClick={() => { if (validar()) setStep('pago') }}
              style={{
                background: COLORS.primary, color: '#fff', border: 'none',
                borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
              }}>
              Continuar →
            </button>

            <button onClick={() => setStep('plan')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 13 }}>
              ← Cambiar plan
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 3: Pago con MP ───────────────────────────────────
  if (step === 'pago') {
    const handlePago = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, plan }),
        })
        const data = await res.json()
        if (!data.ok) { setError(data.error); setLoading(false); return }

        const mpRes = await fetch('/api/suscripcion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_id: plan, payer_email: form.email, org_id: data.org_id }),
        })
        const mpData = await mpRes.json()

        await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
        localStorage.setItem('sf_org_id', data.org_id)
        localStorage.setItem('sf_org_nombre', form.negocio)

        setStep('procesando')

        if (mpData.init_point) {
          setTimeout(() => { window.location.href = mpData.init_point }, 1500)
        } else {
          router.push('/dashboard')
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Error desconocido')
        setLoading(false)
      }
    }

    return (
      <div style={{ ...PAGE_BG, justifyContent: 'center' }}>
        <div style={{ ...cardCommon, maxWidth: 440 }}>
          <h1 style={{ color: '#042F2E', fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: '-0.02em' }}>Método de pago</h1>
          <p style={{ color: '#6B7280', margin: '2px 0 24px', fontSize: 13 }}>Paso 2 de 2 — Configurá la tarjeta</p>

          <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: COLORS.primary }} />
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: COLORS.primary }} />
          </div>

          <div style={{ background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#042F2E' }}>{planData.nombre}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>Después de los 30 días gratis</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLORS.primary }}>${planData.precio.toLocaleString('es-AR')}/mes</p>
            </div>
          </div>

          <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#166534' }}>🎁 30 días completamente gratis</p>
            <p style={{ margin: 0, fontSize: 12, color: '#166534', lineHeight: 1.5 }}>
              Tu tarjeta <strong>NO se cobra hoy</strong>. El primer cobro es recién el día 31. Cancelás antes sin cargo.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 10 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <p style={{ margin: 0, fontSize: 12, color: '#1C4542', lineHeight: 1.5 }}>
              Pago seguro procesado por <strong style={{ color: COLORS.secondary }}>Mercado Pago</strong>. StockFlow nunca ve los datos de tu tarjeta.
            </p>
          </div>

          {error && (
            <div style={{ background: '#FFF1F2', color: '#9F1239', border: '1px solid #FECDD3', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button onClick={handlePago} disabled={loading}
            style={{
              width: '100%', background: COLORS.primary, border: 'none', borderRadius: 10,
              padding: '14px', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
            }}>
            <span style={{ fontSize: 18 }}>💳</span>
            {loading ? 'Creando cuenta…' : 'Continuar con Mercado Pago'}
          </button>

          <button onClick={() => setStep('datos')}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 13, marginTop: 12 }}>
            ← Volver a mis datos
          </button>
        </div>
      </div>
    )
  }

  // ── STEP 4: Procesando ────────────────────────────────────
  return (
    <div style={{ ...PAGE_BG, justifyContent: 'center', gap: 16 }}>
      <div style={{ fontSize: 48 }}>⏳</div>
      <p style={{ color: '#042F2E', fontWeight: 700, fontSize: 18, margin: 0 }}>Creando tu cuenta…</p>
      <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>Te redirigimos a Mercado Pago para completar el pago</p>
    </div>
  )
}
