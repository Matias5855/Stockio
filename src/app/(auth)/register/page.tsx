'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const supabase = createClient()
  const router = useRouter()
  const [form, setForm] = useState({ nombre: '', negocio: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRegister = async () => {
    setLoading(true)
    setError(null)
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })
    if (authErr || !authData.user) { setError(authErr?.message ?? 'Error al registrar'); setLoading(false); return }

    const slug = form.negocio.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: form.negocio, slug })
      .select().single()
    if (orgErr) { setError(orgErr.message); setLoading(false); return }

    await supabase.from('profiles').insert({
      id: authData.user.id,
      org_id: org.id,
      full_name: form.nombre,
      role: 'owner',
    })

    router.push('/dashboard')
    router.refresh()
  }

  const fields = [
    { key: 'nombre', placeholder: 'Tu nombre completo', type: 'text' },
    { key: 'negocio', placeholder: 'Nombre de tu negocio', type: 'text' },
    { key: 'email', placeholder: 'Email', type: 'email' },
    { key: 'password', placeholder: 'Contraseña (mín. 6 caracteres)', type: 'password' },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0F12' }}>
      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 40, width: 380 }}>
        <h1 style={{ color: '#7C6FE0', fontWeight: 800, fontSize: 24, margin: '0 0 4px' }}>StockFlow</h1>
        <p style={{ color: '#7A7A95', margin: '0 0 28px', fontSize: 14 }}>Creá tu cuenta y negocio</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map(f => (
            <input key={f.key} type={f.type} placeholder={f.placeholder}
              value={(form as any)[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              style={{ background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', color: '#F0EFF8', fontSize: 14, outline: 'none' }} />
          ))}
          {error && <p style={{ color: '#E05555', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={handleRegister} disabled={loading}
            style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
          </button>
          <p style={{ color: '#7A7A95', fontSize: 13, textAlign: 'center', margin: 0 }}>
            ¿Ya tenés cuenta? <a href="/login" style={{ color: '#7C6FE0' }}>Iniciar sesión</a>
          </p>
        </div>
      </div>
    </div>
  )
}