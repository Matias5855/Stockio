'use client'

/**
 * Form de "crear nueva contraseña" del flow de recovery.
 *
 * Cuando el user llega aca, /auth/confirm ya proceso el token_hash del link
 * y creo la sesion via cookies. Por eso podemos llamar a updateUser() directo
 * sin necesidad de escuchar PASSWORD_RECOVERY ni manejar fragmentos del URL.
 *
 * Si por algun motivo no hay sesion al llegar (link tampered, cookies
 * bloqueadas, etc.) mandamos a /recuperar con el aviso de "link invalido".
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { COLORS } from '@/lib/theme'

// IMPORTANTE: este wrapper TIENE que estar definido fuera del componente.
// Si se define adentro, cada render crea una funcion nueva -> React desmonta
// y vuelve a montar todo el subtree, lo que hace que el foco salte al input
// con autoFocus en cada tecla. Bug clasico: tipeas en "Confirmar contraseña"
// y el cursor vuelve solo al primer input.
function PageWrap({ children }: { children: React.ReactNode }) {
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
      {children}
    </div>
  )
}

export default function NuevaContrasenaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  // Verificar al cargar que hay sesion (deberia haberla porque /auth/confirm
  // la creo). Si no, mandar a /recuperar con el aviso.
  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        router.replace('/recuperar?error=invalid_link')
        return
      }
      setChecking(false)
    })
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

  if (checking) {
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
