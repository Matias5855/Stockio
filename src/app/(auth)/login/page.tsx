'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0F12' }}>
      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 40, width: 360 }}>
        <h1 style={{ color: '#7C6FE0', fontWeight: 800, fontSize: 24, margin: '0 0 4px' }}>StockFlow</h1>
        <p style={{ color: '#7A7A95', margin: '0 0 28px', fontSize: 14 }}>Ingresá a tu cuenta</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', color: '#F0EFF8', fontSize: 14, outline: 'none' }} />
          <input type="password" placeholder="Contraseña" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', color: '#F0EFF8', fontSize: 14, outline: 'none' }} />
          {error && <p style={{ color: '#E05555', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={handleLogin} disabled={loading}
            style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
          <p style={{ color: '#7A7A95', fontSize: 13, textAlign: 'center', margin: 0 }}>
            ¿No tenés cuenta? <a href="/register" style={{ color: '#7C6FE0' }}>Registrarse</a>
          </p>
        </div>
      </div>
    </div>
  )
}