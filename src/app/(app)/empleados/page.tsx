'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Empleado = {
  id: string
  full_name: string | null
  role: string
  permisos: Record<string, boolean>
  created_at: string
}

type Invitacion = {
  id: string
  email: string
  role: string
  accepted: boolean
  expires_at: string
  created_at: string
}

const PERMISOS_LABELS: Record<string, string> = {
  ver_dashboard:       'Ver Dashboard',
  ver_stock:           'Ver Inventario',
  editar_stock:        'Editar Inventario',
  ver_ventas:          'Ver Ventas',
  crear_ventas:        'Crear Ventas',
  ver_finanzas:        'Ver Finanzas',
  ver_archivos:        'Ver Archivos',
  gestionar_usuarios:  'Gestionar Usuarios',
}

const ROLES_PRESET: Record<string, Record<string, boolean>> = {
  admin: {
    ver_dashboard: true, ver_stock: true, editar_stock: true,
    ver_ventas: true, crear_ventas: true, ver_finanzas: true,
    ver_archivos: true, gestionar_usuarios: false,
  },
  vendedor: {
    ver_dashboard: true, ver_stock: true, editar_stock: false,
    ver_ventas: true, crear_ventas: true, ver_finanzas: false,
    ver_archivos: false, gestionar_usuarios: false,
  },
  repositor: {
    ver_dashboard: true, ver_stock: true, editar_stock: true,
    ver_ventas: false, crear_ventas: false, ver_finanzas: false,
    ver_archivos: false, gestionar_usuarios: false,
  },
}

const inp: React.CSSProperties = {
  background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, padding: '9px 12px', color: '#F0EFF8',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

export default function EmpleadosPage() {
  const supabase = createClient()
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [form, setForm] = useState({ email: '', role: 'vendedor' })
  const [permisos, setPermisos] = useState(ROLES_PRESET.vendedor)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [esPremium, setEsPremium] = useState(false)

  const orgId = localStorage.getItem('sf_org_id')

  const fetchData = useCallback(async () => {
    setLoading(true)
    // Verificar plan
    const { data: sus } = await supabase
      .from('suscripciones').select('plan_id').eq('org_id', orgId!).single()
    setEsPremium(sus?.plan_id === 'premium')

    // Empleados
    const { data: perfiles } = await supabase
      .from('profiles').select('*')
      .eq('org_id', orgId!).neq('role', 'owner')
    setEmpleados(perfiles ?? [])

    // Invitaciones pendientes
    const { data: invs } = await supabase
      .from('invitaciones').select('*')
      .eq('org_id', orgId!).eq('accepted', false)
      .order('created_at', { ascending: false })
    setInvitaciones(invs ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => { fetchData() }, [fetchData])

  const invitar = async () => {
    if (!form.email) return
    const { data, error } = await supabase.from('invitaciones').insert({
      org_id: orgId!,
      email: form.email,
      role: form.role,
    }).select().single()
    if (error) { setMsg({ text: error.message, ok: false }); return }

    // Enviar email con el link de invitación
    await fetch('/api/empleados/invitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        token: data.token,
        role: form.role,
        org_name: localStorage.getItem('sf_org_name') ?? 'Tu negocio',
      }),
    })

    setMsg({ text: `Invitación enviada a ${form.email}`, ok: true })
    setModal(false)
    setForm({ email: '', role: 'vendedor' })
    fetchData()
    setTimeout(() => setMsg(null), 4000)
  }

  const actualizarPermisos = async (empleadoId: string, nuevosPermisos: Record<string, boolean>) => {
    const { error } = await supabase
      .from('profiles').update({ permisos: nuevosPermisos }).eq('id', empleadoId)
    if (error) setMsg({ text: error.message, ok: false })
    else { setMsg({ text: 'Permisos actualizados', ok: true }); fetchData(); setEditando(null) }
    setTimeout(() => setMsg(null), 3000)
  }

  const eliminarEmpleado = async (id: string) => {
    if (!confirm('¿Eliminar este empleado? Perderá acceso al sistema.')) return
    await supabase.from('profiles').delete().eq('id', id)
    fetchData()
  }

  const cancelarInvitacion = async (id: string) => {
    await supabase.from('invitaciones').delete().eq('id', id)
    fetchData()
  }

  const roleColor = (role: string) => ({
    owner:   { bg: 'rgba(124,111,224,0.15)', color: '#B4A8FF' },
    admin:   { bg: 'rgba(59,142,234,0.12)',  color: '#3B8EEA' },
    vendedor:{ bg: 'rgba(34,201,122,0.12)',  color: '#22C97A' },
    repositor:{ bg:'rgba(224,160,48,0.12)', color: '#E0A030' },
    member:  { bg: 'rgba(120,120,140,0.12)', color: '#7A7A95' },
  }[role] ?? { bg: 'rgba(120,120,140,0.12)', color: '#7A7A95' })

  if (!esPremium) {
    return (
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Gestión de empleados</p>
        <div style={{ marginTop: 40, textAlign: 'center', background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 48 }}>
          <p style={{ fontSize: 40, marginBottom: 16 }}>👥</p>
          <p style={{ fontWeight: 700, fontSize: 18, color: '#F0EFF8', marginBottom: 8 }}>Función exclusiva del plan Premium</p>
          <p style={{ color: '#7A7A95', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            Con StockFlow Premium podés agregar empleados ilimitados, asignarles roles y que todos vean el mismo stock en tiempo real.
          </p>
          <a href="/configuracion" style={{ background: '#7C6FE0', color: '#fff', borderRadius: 8, padding: '11px 24px', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
            Actualizar a Premium
          </a>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Gestión de empleados</p>
          <p style={{ margin: 0, fontSize: 13, color: '#7A7A95' }}>
            {empleados.length} empleado{empleados.length !== 1 ? 's' : ''} · {invitaciones.length} invitación{invitaciones.length !== 1 ? 'es' : ''} pendiente{invitaciones.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setModal(true)}
          style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Invitar empleado
        </button>
      </div>

      {msg && (
        <div style={{ background: msg.ok ? 'rgba(34,201,122,0.12)' : 'rgba(224,85,85,0.12)', border: `1px solid ${msg.ok ? 'rgba(34,201,122,0.3)' : 'rgba(224,85,85,0.3)'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600, color: msg.ok ? '#22C97A' : '#E05555' }}>
          {msg.text}
        </div>
      )}

      {/* Empleados activos */}
      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Empleados activos</p>
        </div>
        {loading ? <p style={{ padding: 40, textAlign: 'center', color: '#7A7A95' }}>Cargando...</p>
          : empleados.length === 0 ? <p style={{ padding: 40, textAlign: 'center', color: '#7A7A95' }}>Aún no hay empleados. Invitá al primero.</p>
          : empleados.map(e => {
            const rc = roleColor(e.role)
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(124,111,224,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#7C6FE0' }}>
                    {(e.full_name ?? 'E')[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{e.full_name ?? 'Sin nombre'}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A7A95' }}>Desde {new Date(e.created_at).toLocaleDateString('es-AR')}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ background: rc.bg, color: rc.color, padding: '3px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{e.role}</span>
                  <button onClick={() => { setEditando(e); setPermisos(e.permisos ?? {}) }}
                    style={{ background: 'rgba(124,111,224,0.12)', border: '1px solid rgba(124,111,224,0.3)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', color: '#7C6FE0', fontSize: 12, fontWeight: 500 }}>
                    Permisos
                  </button>
                  <button onClick={() => eliminarEmpleado(e.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E05555', fontSize: 18 }}>×</button>
                </div>
              </div>
            )
          })
        }
      </div>

      {/* Invitaciones pendientes */}
      {invitaciones.length > 0 && (
        <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invitaciones pendientes</p>
          </div>
          {invitaciones.map(inv => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{inv.email}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A7A95' }}>
                  Rol: {inv.role} · Vence: {new Date(inv.expires_at).toLocaleDateString('es-AR')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ background: 'rgba(224,160,48,0.12)', color: '#E0A030', padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600 }}>Pendiente</span>
                <button onClick={() => cancelarInvitacion(inv.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E05555', fontSize: 18 }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal invitar */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
            <p style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700 }}>Invitar empleado</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95', fontWeight: 500 }}>Email del empleado</p>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="empleado@ejemplo.com" style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7A7A95', fontWeight: 500 }}>Rol</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {Object.keys(ROLES_PRESET).map(r => (
                    <button key={r} onClick={() => { setForm(p => ({ ...p, role: r })); setPermisos(ROLES_PRESET[r]) }}
                      style={{ background: form.role === r ? 'rgba(124,111,224,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${form.role === r ? 'rgba(124,111,224,0.6)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: form.role === r ? '#B4A8FF' : '#7A7A95', fontSize: 13, fontWeight: form.role === r ? 600 : 400, textTransform: 'capitalize' }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview de permisos */}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 16px' }}>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#7A7A95', fontWeight: 600 }}>Permisos del rol</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {Object.entries(PERMISOS_LABELS).map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ color: permisos[key] ? '#22C97A' : '#4A4A62', fontWeight: 700 }}>
                        {permisos[key] ? '✓' : '✗'}
                      </span>
                      <span style={{ color: permisos[key] ? '#F0EFF8' : '#4A4A62' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', color: '#7A7A95', fontSize: 13 }}>Cancelar</button>
              <button onClick={invitar} style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Enviar invitación</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar permisos */}
      {editando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
            <p style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700 }}>Permisos de {editando.full_name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(PERMISOS_LABELS).map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, cursor: 'pointer' }}>
                  <span style={{ fontSize: 14, color: '#F0EFF8' }}>{label}</span>
                  <div
                    onClick={() => setPermisos(p => ({ ...p, [key]: !p[key] }))}
                    style={{ width: 44, height: 24, borderRadius: 12, background: permisos[key] ? '#7C6FE0' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: permisos[key] ? 23 : 3, transition: 'left 0.2s' }} />
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditando(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', color: '#7A7A95', fontSize: 13 }}>Cancelar</button>
              <button onClick={() => actualizarPermisos(editando.id, permisos)} style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Guardar permisos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}