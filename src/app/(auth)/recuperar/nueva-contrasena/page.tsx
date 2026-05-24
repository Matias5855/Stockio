'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { COLORS } from '@/lib/theme'

export default function NuevaContrasenaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [linkExpired, setLinkExpired] = useState(false)

  // Supabase dispara PASSWORD_RECOVERY cuando el browser carga el link del email.
  // Si pasan 5 segundos sin evento, asumimos que el link es invalido o expiro.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    const timeout = setTimeout(() => {
      // Si despues de 5s no llego PASSWORD_RECOVERY, el link no es valido
      setReady(prev => {
        if (!prev) setLinkExpired(true)
        return prev
      })
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpdate = async () => {
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }

    router.push('/dashboard')
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

  const PageWrap = ({ children }: { children: React.ReactNode }) => (
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
      {children}
    </div>
  )

  // Estado 1: validando el link
  if (!ready && !linkExpired) {
    return (
      <PageWrap>
        <div style={{
          background: '#FFFFFF', border: '1px solid #CCFBF1', borderRadius: 16,
          padding: 36, width: '100%', maxWidth: 420, textAlign: 'center',
          boxShadow: '0 4px 24px rgba(4,47,46,0.06)',
        }}>
          <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>
            Verificando link…
          </p>
        </div>
      </PageWrap>
    )
  }

  // Estado 2: el link es invalido o expiro
  if (linkExpired) {
    return (
      <PageWrap>
        <div style={{
          background: '#FFFFFF', border: '1px solid #CCFBF1', borderRadius: 16,
          padding: 36, width: '100%', maxWidth: 420, textAlign: 'center',
          boxShadow: '0 4px 24px rgba(4,47,46,0.06)',
        }}>
          <div style={{
            width: 56, height: 56,
            borderRadius: '50%',
            background: '#FFF1F2', color: '#9F1239',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, margin: '0 auto 16px',
          }}>
            ⚠
          </div>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#042F2E', margin: '0 0 8px' }}>
            El link no es válido o expiró
          </p>
          <p style={{ color: '#1C4542', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
            Los links de recuperación expiran en 1 hora por seguridad.
            Pedí uno nuevo desde el formulario.
          </p>
          <Link href="/recuperar" style={{
            display: 'inline-block',
            background: COLORS.primary, color: '#FFFFFF',
            border: 'none', borderRadius: 10,
            padding: '11px 24px', fontSize: 14, fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
          }}>
            Pedir nuevo link
          </Link>
        </div>
      </PageWrap>
    )
  }

  // Estado 3: link valido, mostrar form para nueva password
  return (
    <PageWrap>
      <div style={{
        background: '#FFFFFF', border: '1px solid #CCFBF1', borderRadius: 16,
        padding: 36, width: '100%', maxWidth: 420,
        boxShadow: '0 4px 24px rgba(4,47,46,0.06)',
      }}>
        <h1 style={{
          color: '#042F2E', fontWeight: 800, fontSize: 22, margin: 0,
          letterSpacing: '-0.02em',
        }}>
          Crear nueva contraseña
        </h1>
        <p style={{ color: '#6B7280', margin: '4px 0 24px', fontSize: 13 }}>
          Elegí una contraseña de al menos 6 caracteres
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Nueva contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              style={{ ...inp, paddingRight: 44 }}
            />
            <button
              onClick={() => setShowPass(v => !v)}
              tabIndex={-1}
              type="button"
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              style={{
                position: 'absolute', right: 10, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6B7280', padding: 6,
              }}
            >
              {showPass ? '🙈' : '👁'}
            </button>
          </div>

          <input
            type={showPass ? 'text' : 'password'}
            placeholder="Confirmar contraseña"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUpdate()}
            autoComplete="new-password"
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
            onClick={handleUpdate}
            disabled={loading}
            style={{
              background: COLORS.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 10,
              padding: 13,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              boxShadow: loading ? 'none' : '0 4px 14px rgba(13,148,136,0.25)',
            }}
          >
            {loading ? 'Actualizando…' : 'Guardar nueva contraseña'}
          </button>
        </div>
      </div>
    </PageWrap>
  )
}
