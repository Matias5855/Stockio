'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COLORS } from '@/lib/theme'

export default function InviteForm({ token, email }: { token: string; email: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (fullName.trim().length < 2) return setError('Ingresá tu nombre completo')
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres')

    setLoading(true)
    try {
      const res = await fetch('/api/empleados/aceptar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, full_name: fullName.trim() }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? 'Error procesando la invitación')
        setLoading(false)
        return
      }

      // Login automatico
      await supabase.auth.signInWithPassword({ email, password })
      if (data.org_id) localStorage.setItem('stk_org_id', data.org_id)
      if (data.org_name) localStorage.setItem('stk_org_nombre', data.org_name)

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
      setLoading(false)
    }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={{ margin: '0 0 5px', fontSize: 12, color: '#6B7280', fontWeight: 600 }}>Tu nombre completo</p>
        <input
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          placeholder="Ej: Juan Pérez"
          style={inp}
        />
      </div>

      <div>
        <p style={{ margin: '0 0 5px', fontSize: 12, color: '#6B7280', fontWeight: 600 }}>Creá una contraseña</p>
        <div style={{ position: 'relative' }}>
          <input
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Mínimo 6 caracteres"
            style={{ ...inp, paddingRight: 44 }}
          />
          <button
            onClick={() => setShowPass(v => !v)}
            tabIndex={-1}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280',
              padding: 6, fontSize: 16,
            }}
          >
            {showPass ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#FFF1F2', color: '#9F1239',
          border: '1px solid #FECDD3', borderRadius: 8,
          padding: '10px 12px', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={loading}
        style={{
          background: COLORS.primary, color: '#fff', border: 'none',
          borderRadius: 10, padding: '13px',
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          opacity: loading ? 0.7 : 1,
          boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
        }}
      >
        {loading ? 'Creando cuenta…' : 'Aceptar invitación →'}
      </button>

      <p style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', margin: 0 }}>
        Al continuar, aceptás las condiciones de uso de Stockio.
      </p>
    </div>
  )
}
