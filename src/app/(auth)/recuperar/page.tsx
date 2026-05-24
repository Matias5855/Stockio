'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { COLORS } from '@/lib/theme'

export default function RecuperarPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Si llegamos con ?error=invalid_link (el endpoint /auth/confirm
  // nos redirigio aca porque el token expiro o es invalido), mostrar aviso.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'invalid_link') {
      setError('El link del email expiró o ya fue usado. Pedí uno nuevo abajo.')
    }
  }, [])

  const handleRecover = async () => {
    if (!email) return
    setLoading(true)
    setError(null)

    // El link del email pega en /auth/confirm que es un route handler server-side.
    // Ese endpoint hace verifyOtp() con el token_hash y crea la sesion via cookies,
    // despues redirige a `next` con la sesion ya activa. Esto es necesario porque
    // @supabase/ssr usa flow PKCE y los tokens NO vienen en el fragment (#) sino
    // en query params (?token_hash=...) — no se pueden procesar client-side.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/recuperar/nueva-contrasena`,
    })

    if (error) { setError(error.message); setLoading(false); return }
    setSent(true)
    setLoading(false)
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
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '32px 20px',
      background: '#F0FDFA',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 28 }}>
        <div style={{
          width: 36, height: 36, background: COLORS.primary, color: '#FFFFFF',
          borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 18,
        }}>S</div>
        <span style={{ color: '#042F2E', fontWeight: 800, fontSize: 22 }}>Stockio</span>
      </Link>

      <div style={{
        background: '#FFFFFF',
        border: '1px solid #CCFBF1',
        borderRadius: 16,
        padding: 36,
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 4px 24px rgba(4,47,46,0.06)',
      }}>
        <h1 style={{
          color: '#042F2E', fontWeight: 800, fontSize: 22, margin: 0,
          letterSpacing: '-0.02em',
        }}>
          Recuperar contraseña
        </h1>
        <p style={{ color: '#6B7280', margin: '4px 0 24px', fontSize: 13 }}>
          Te mandamos un link a tu email para crear una nueva
        </p>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56,
              borderRadius: '50%',
              background: '#DCFCE7',
              color: '#166534',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26,
              margin: '0 auto 16px',
            }}>
              ✓
            </div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#042F2E', margin: '0 0 8px' }}>
              ¡Email enviado!
            </p>
            <p style={{ color: '#1C4542', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
              Revisá tu bandeja de entrada en{' '}
              <strong style={{ color: '#042F2E' }}>{email}</strong>{' '}
              y hacé click en el link para crear una nueva contraseña.
            </p>
            <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 20px' }}>
              ¿No llegó? Revisá la carpeta de spam. El link expira en 1 hora.
            </p>
            <Link href="/login" style={{
              display: 'inline-block',
              color: COLORS.primary, fontWeight: 600, fontSize: 14,
              textDecoration: 'none',
            }}>
              ← Volver al login
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRecover()}
              autoComplete="email"
              autoFocus
              style={inp}
            />

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
              onClick={handleRecover}
              disabled={loading || !email}
              style={{
                background: COLORS.primary,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                padding: 13,
                fontSize: 15,
                fontWeight: 700,
                cursor: loading || !email ? 'not-allowed' : 'pointer',
                opacity: loading || !email ? 0.6 : 1,
                boxShadow: loading || !email ? 'none' : '0 4px 14px rgba(13,148,136,0.25)',
              }}
            >
              {loading ? 'Enviando…' : 'Enviar link de recuperación'}
            </button>

            <Link href="/login" style={{
              color: '#6B7280', fontSize: 13, textAlign: 'center',
              textDecoration: 'none', marginTop: 4,
            }}>
              ← Volver al login
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
