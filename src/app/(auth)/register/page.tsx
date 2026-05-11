'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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
}

type Step = 'plan' | 'datos' | 'pago' | 'procesando'

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
    background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, padding: '10px 14px', color: '#F0EFF8',
    fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  // ── STEP 1: Elegir plan ───────────────────────────────────
  if (step === 'plan') {
    return (
      <div style={{ minHeight: '100vh', background: '#0F0F12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <h1 style={{ color: '#7C6FE0', fontWeight: 800, fontSize: 28, margin: '0 0 8px', textAlign: 'center' }}>StockFlow</h1>
        <p style={{ color: '#7A7A95', margin: '0 0 40px', fontSize: 15, textAlign: 'center' }}>
          Elegí tu plan — <strong style={{ color: '#22C97A' }}>30 días gratis</strong>, sin cargo hasta el día 31
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, width: '100%', maxWidth: 680 }}>
          {(Object.entries(PLANES) as [string, typeof PLANES.normal][]).map(([key, p]) => (
            <div key={key}
              onClick={() => { setPlan(key as any); setStep('datos') }}
              style={{
                background: key === 'premium' ? 'linear-gradient(135deg, rgba(124,111,224,0.15), #17171C)' : '#17171C',
                border: `2px solid ${key === 'premium' ? '#7C6FE0' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 16, padding: 28, cursor: 'pointer',
                transition: 'transform 0.15s, border-color 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {key === 'premium' && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#7C6FE0', color: '#fff', borderRadius: 100, padding: '4px 14px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  ⭐ MÁS POPULAR
                </div>
              )}
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.nombre}</p>
              <p style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 800, color: '#F0EFF8' }}>
                ${p.precio.toLocaleString('es-AR')}
                <span style={{ fontSize: 14, fontWeight: 400, color: '#7A7A95' }}>/mes</span>
              </p>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#7A7A95' }}>{p.descripcion}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: '#F0EFF8', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#22C97A', fontWeight: 700 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <div style={{ background: '#7C6FE0', borderRadius: 8, padding: '11px', textAlign: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                Empezar 30 días gratis →
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 11, color: '#7A7A95', textAlign: 'center' }}>
                No se cobra nada hasta el día 31. Cancelás cuando querés.
              </p>
            </div>
          ))}
        </div>

        <p style={{ color: '#7A7A95', fontSize: 13, marginTop: 24 }}>
          ¿Ya tenés cuenta? <a href="/login" style={{ color: '#7C6FE0' }}>Iniciar sesión</a>
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
      return true
    }

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0F12', padding: 20 }}>
        <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 40, width: '100%', maxWidth: 420 }}>
          {/* Header con plan */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 style={{ color: '#7C6FE0', fontWeight: 800, fontSize: 22, margin: 0 }}>StockFlow</h1>
              <p style={{ color: '#7A7A95', margin: '2px 0 0', fontSize: 13 }}>Creá tu cuenta</p>
            </div>
            <div style={{ background: 'rgba(124,111,224,0.12)', border: '1px solid rgba(124,111,224,0.3)', borderRadius: 8, padding: '6px 12px', textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#7A7A95' }}>Plan elegido</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#B4A8FF' }}>{planData.nombre}</p>
            </div>
          </div>

          {/* Indicador de pasos */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
            {['Datos', 'Pago'].map((s, i) => (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i === 0 ? '#7C6FE0' : 'rgba(255,255,255,0.1)' }} />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'nombre',  placeholder: 'Tu nombre completo', type: 'text' },
              { key: 'negocio', placeholder: 'Nombre de tu negocio', type: 'text' },
              { key: 'email',   placeholder: 'Email', type: 'email' },
            ].map(f => (
              <input key={f.key} type={f.type} placeholder={f.placeholder}
                value={(form as any)[f.key]}
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
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95' }}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>

            {error && <p style={{ color: '#E05555', fontSize: 13, margin: 0 }}>{error}</p>}

            <button onClick={() => { if (validar()) setStep('pago') }}
              style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Continuar →
            </button>

            <button onClick={() => setStep('plan')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95', fontSize: 13 }}>
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
        // 1. Crear cuenta
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, plan }),
        })
        const data = await res.json()
        if (!data.ok) { setError(data.error); setLoading(false); return }

        // 2. Crear suscripción recurrente en MP
        const mpRes = await fetch('/api/suscripcion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_id: plan, payer_email: form.email, org_id: data.org_id }),
        })
        const mpData = await mpRes.json()

        // 3. Login automático
        await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
        localStorage.setItem('sf_org_id', data.org_id)
        localStorage.setItem('sf_org_name', form.negocio)

        setStep('procesando')

        // 4. Redirigir a MP para que ingrese la tarjeta
        if (mpData.init_point) {
          setTimeout(() => { window.location.href = mpData.init_point }, 1500)
        } else {
          // Si MP falla, igual dejamos entrar (el trial igual corre)
          router.push('/dashboard')
        }
      } catch (e: any) {
        setError(e.message)
        setLoading(false)
      }
    }

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0F12', padding: 20 }}>
        <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 40, width: '100%', maxWidth: 420 }}>
          <h1 style={{ color: '#7C6FE0', fontWeight: 800, fontSize: 22, margin: '0 0 4px' }}>StockFlow</h1>
          <p style={{ color: '#7A7A95', margin: '0 0 24px', fontSize: 13 }}>Paso 2 de 2 — Método de pago</p>

          <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
            {['Datos', 'Pago'].map((s, i) => (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: '#7C6FE0' }} />
            ))}
          </div>

          {/* Resumen */}
          <div style={{ background: 'rgba(124,111,224,0.08)', border: '1px solid rgba(124,111,224,0.2)', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#F0EFF8' }}>{planData.nombre}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#7A7A95' }}>Después de los 30 días gratis</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#7C6FE0' }}>${planData.precio.toLocaleString('es-AR')}/mes</p>
            </div>
          </div>

          {/* Info trial */}
          <div style={{ background: 'rgba(34,201,122,0.08)', border: '1px solid rgba(34,201,122,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#22C97A' }}>🎁 30 días completamente gratis</p>
            <p style={{ margin: 0, fontSize: 12, color: '#7A7A95', lineHeight: 1.6 }}>
              Tu tarjeta <strong style={{ color: '#F0EFF8' }}>NO se cobra hoy</strong>. El primer cobro es recién el día 31. Cancelás en cualquier momento antes sin cargo.
            </p>
          </div>

          {/* Seguridad */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <p style={{ margin: 0, fontSize: 12, color: '#7A7A95', lineHeight: 1.5 }}>
              Pago seguro procesado por <strong style={{ color: '#009EE3' }}>Mercado Pago</strong>. StockFlow nunca ve ni guarda los datos de tu tarjeta.
            </p>
          </div>

          {error && (
            <div style={{ background: 'rgba(224,85,85,0.12)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#E05555', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button onClick={handlePago} disabled={loading}
            style={{ width: '100%', background: '#009EE3', border: 'none', borderRadius: 10, padding: '13px', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: loading ? 0.7 : 1 }}>
            <span style={{ fontSize: 20 }}>💳</span>
            {loading ? 'Creando cuenta...' : 'Continuar con Mercado Pago'}
          </button>

          <button onClick={() => setStep('datos')}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95', fontSize: 13, marginTop: 12 }}>
            ← Volver a mis datos
          </button>
        </div>
      </div>
    )
  }

  // ── STEP 4: Procesando ────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0F12', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 48 }}>⏳</div>
      <p style={{ color: '#F0EFF8', fontWeight: 700, fontSize: 18, margin: 0 }}>Creando tu cuenta...</p>
      <p style={{ color: '#7A7A95', fontSize: 14, margin: 0 }}>Te redirigimos a Mercado Pago para completar el pago</p>
    </div>
  )
}