'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { COLORS } from '@/lib/theme'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Panel izquierdo — branding teal */}
      <div style={{
        background: 'linear-gradient(160deg, #0D9488 0%, #042F2E 100%)',
        color: '#FFFFFF',
        padding: '48px 56px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }} className="login-brand-panel">
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 36, height: 36, background: '#FFFFFF', color: COLORS.primary,
            borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 18,
          }}>S</div>
          <span style={{ color: '#FFFFFF', fontWeight: 800, fontSize: 20 }}>StockFlow</span>
        </Link>

        <div>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 34px)',
            fontWeight: 800,
            lineHeight: 1.15,
            margin: '0 0 14px',
            letterSpacing: '-0.02em',
          }}>
            Gestioná tu PyME desde un solo lugar
          </h2>
          <p style={{
            color: '#CCFBF1',
            fontSize: 15,
            lineHeight: 1.55,
            margin: 0,
            maxWidth: 380,
          }}>
            Stock, ventas, finanzas y cuotas. Sin Excel, sin caos.
          </p>
        </div>

        <p style={{ fontSize: 12, color: '#5EEAD4', margin: 0 }}>
          © {new Date().getFullYear()} StockFlow · Hecho en Chaco, Argentina
        </p>
      </div>

      {/* Panel derecho — formulario */}
      <div style={{
        background: '#F0FDFA',
        padding: '48px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h1 style={{ color: '#042F2E', fontWeight: 800, fontSize: 26, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Iniciar sesión
          </h1>
          <p style={{ color: '#6B7280', margin: '0 0 32px', fontSize: 14 }}>
            Ingresá a tu cuenta de StockFlow
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inp}
            />

            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{ ...inp, paddingRight: 44 }}
              />
              <button
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280',
                  padding: 6, display: 'flex', alignItems: 'center',
                }}
                tabIndex={-1}
                aria-label="Toggle password"
              >
                {showPass ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>

            {error && (
              <div style={{
                background: '#FFF1F2',
                color: '#9F1239',
                border: '1px solid #FECDD3',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                background: COLORS.primary,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                padding: '13px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
              }}
            >
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>

            <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', margin: '8px 0 0' }}>
              ¿No tenés cuenta?{' '}
              <Link href="/register" style={{ color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
                Registrate gratis
              </Link>
            </p>
            <p style={{ fontSize: 13, textAlign: 'center', margin: 0 }}>
              <Link href="/recuperar" style={{ color: '#6B7280', textDecoration: 'none' }}>
                ¿Olvidaste tu contraseña?
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
