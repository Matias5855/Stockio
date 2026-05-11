'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function RecuperarPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRecover = async () => {
    if (!email) return
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/recuperar/nueva-contrasena`,
    })

    if (error) { setError(error.message); setLoading(false); return }
    setSent(true)
    setLoading(false)
  }

  const inp: React.CSSProperties = {
    background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, padding: '10px 14px', color: '#F0EFF8',
    fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0F12', padding: 20 }}>
      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 40, width: '100%', maxWidth: 380 }}>
        <h1 style={{ color: '#7C6FE0', fontWeight: 800, fontSize: 24, margin: '0 0 4px' }}>StockFlow</h1>
        <p style={{ color: '#7A7A95', margin: '0 0 28px', fontSize: 14 }}>Recuperar contraseña</p>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#F0EFF8', marginBottom: 8 }}>¡Email enviado!</p>
            <p style={{ color: '#7A7A95', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Revisá tu bandeja de entrada en <strong style={{ color: '#F0EFF8' }}>{email}</strong> y hacé click en el link para crear una nueva contraseña.
            </p>
            <p style={{ color: '#7A7A95', fontSize: 12 }}>
              ¿No llegó? Revisá la carpeta de spam.
            </p>
            <a href="/login" style={{ display: 'block', marginTop: 20, color: '#7C6FE0', fontSize: 14, textDecoration: 'none' }}>
              ← Volver al login
            </a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: '#7A7A95', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              Ingresá tu email y te mandamos un link para crear una nueva contraseña.
            </p>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRecover()}
              style={inp}
            />
            {error && (
              <div style={{ background: 'rgba(224,85,85,0.12)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 8, padding: '10px 14px', color: '#E05555', fontSize: 13 }}>
                {error}
              </div>
            )}
            <button onClick={handleRecover} disabled={loading || !email}
              style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading || !email ? 0.7 : 1 }}>
              {loading ? 'Enviando...' : 'Enviar link de recuperación'}
            </button>
            <a href="/login" style={{ color: '#7A7A95', fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>
              ← Volver al login
            </a>
          </div>
        )}
      </div>
    </div>
  )
}