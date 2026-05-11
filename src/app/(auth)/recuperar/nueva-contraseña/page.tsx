'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NuevaContrasenaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase maneja el token del link automáticamente
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
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
    background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, padding: '10px 14px', color: '#F0EFF8',
    fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0F12' }}>
      <p style={{ color: '#7A7A95' }}>Verificando link...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0F12', padding: 20 }}>
      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 40, width: '100%', maxWidth: 380 }}>
        <h1 style={{ color: '#7C6FE0', fontWeight: 800, fontSize: 24, margin: '0 0 4px' }}>StockFlow</h1>
        <p style={{ color: '#7A7A95', margin: '0 0 28px', fontSize: 14 }}>Crear nueva contraseña</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { val: password, set: setPassword, placeholder: 'Nueva contraseña' },
            { val: confirm,  set: setConfirm,  placeholder: 'Confirmar contraseña' },
          ].map((f, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder={f.placeholder}
                value={f.val}
                onChange={e => f.set(e.target.value)}
                style={{ ...inp, paddingRight: 44 }}
              />
              {i === 0 && (
                <button onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95', padding: 4 }}>
                  {showPass ? '🙈' : '👁'}
                </button>
              )}
            </div>
          ))}

          {error && (
            <div style={{ background: 'rgba(224,85,85,0.12)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 8, padding: '10px 14px', color: '#E05555', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button onClick={handleUpdate} disabled={loading}
            style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Actualizando...' : 'Guardar nueva contraseña'}
          </button>
        </div>
      </div>
    </div>
  )
}