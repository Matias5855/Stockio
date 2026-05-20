'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTheme, COLORS } from '@/lib/theme'
import { useNav } from '../layout'

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
  token?: string
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

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('stk_dark_mode') === '1')
    sync()
    const interval = setInterval(sync, 500)
    return () => clearInterval(interval)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  const fetchData = useCallback(async () => {
    const orgId = localStorage.getItem('stk_org_id')
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const { data: sus } = await supabase
      .from('suscripciones').select('plan_id').eq('org_id', orgId).single()
    const planId = (sus?.plan_id ?? '').toLowerCase()
    setEsPremium(planId === 'premium')

    const { data: perfiles } = await supabase
      .from('profiles').select('*')
      .eq('org_id', orgId).neq('role', 'owner')
    setEmpleados((perfiles ?? []) as Empleado[])

    const { data: invs } = await supabase
      .from('invitaciones').select('*')
      .eq('org_id', orgId).eq('accepted', false)
      .order('created_at', { ascending: false })
    setInvitaciones((invs ?? []) as Invitacion[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const invitar = async () => {
    if (!form.email) return
    const orgId = localStorage.getItem('stk_org_id')
    const { data, error } = await supabase.from('invitaciones').insert({
      org_id: orgId,
      email: form.email,
      role: form.role,
    }).select().single()
    if (error) { setMsg({ text: error.message, ok: false }); return }

    await fetch('/api/empleados/invitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        token: (data as { token: string }).token,
        role: form.role,
        org_name: localStorage.getItem('stk_org_nombre') ?? 'Tu negocio',
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

  const rolePalette = (role: string): { bg: string; text: string } => {
    switch (role) {
      case 'admin':     return { bg: '#DBEAFE', text: '#1E40AF' }
      case 'vendedor':  return COLORS.badge.ok
      case 'repositor': return COLORS.badge.bajo
      default:          return { bg: '#F3F4F6', text: '#6B7280' }
    }
  }

  const inp: React.CSSProperties = {
    background: t.card, border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '10px 12px', color: t.text, fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }

  if (!esPremium && !loading) {
    return <PaywallPremium textoTema={t} />
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Gestión de empleados</p>
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>
            {empleados.length} empleado{empleados.length !== 1 ? 's' : ''} · {invitaciones.length} invitación{invitaciones.length !== 1 ? 'es' : ''} pendiente{invitaciones.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setModal(true)} style={{
          background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
          boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
        }}>+ Invitar empleado</button>
      </div>

      {msg && (
        <div style={{
          background: msg.ok ? COLORS.badge.ok.bg : COLORS.badge.error.bg,
          border: `1px solid ${msg.ok ? '#86EFAC' : '#FECDD3'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600,
          color: msg.ok ? COLORS.badge.ok.text : COLORS.badge.error.text,
        }}>
          {msg.text}
        </div>
      )}

      {/* Empleados */}
      <div style={{ background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.borderCard}`, background: isDark ? 'rgba(94,234,212,0.04)' : '#F0FDFA' }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: isDark ? '#5EEAD4' : '#115E59', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Empleados activos
          </p>
        </div>
        {loading ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted }}>Cargando…</p>
        ) : empleados.length === 0 ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
            Aún no hay empleados. Invitá al primero.
          </p>
        ) : empleados.map(e => {
          const rp = rolePalette(e.role)
          return (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: `1px solid ${t.borderCard}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%', background: '#CCFBF1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 16, color: COLORS.primary,
                }}>
                  {(e.full_name ?? 'E')[0].toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: t.text }}>{e.full_name ?? 'Sin nombre'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: t.textMuted }}>
                    Desde {new Date(e.created_at).toLocaleDateString('es-AR')}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: rp.bg, color: rp.text,
                  padding: '3px 12px', borderRadius: 100,
                  fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                }}>{e.role}</span>
                <button onClick={() => { setEditando(e); setPermisos(e.permisos ?? {}) }} style={{
                  background: '#CCFBF1', border: 'none', borderRadius: 7,
                  padding: '6px 14px', cursor: 'pointer',
                  color: COLORS.primary, fontSize: 12, fontWeight: 700,
                }}>Permisos</button>
                <button onClick={() => eliminarEmpleado(e.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: t.textMuted, fontSize: 20, padding: 6, borderRadius: 6, lineHeight: 1,
                }}
                  onMouseEnter={ev => { ev.currentTarget.style.color = COLORS.danger; ev.currentTarget.style.background = '#FFF1F2' }}
                  onMouseLeave={ev => { ev.currentTarget.style.color = t.textMuted; ev.currentTarget.style.background = 'none' }}
                >×</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Invitaciones */}
      {invitaciones.length > 0 && (
        <div style={{ background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.borderCard}`, background: isDark ? 'rgba(94,234,212,0.04)' : '#F0FDFA' }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: isDark ? '#5EEAD4' : '#115E59', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Invitaciones pendientes
            </p>
          </div>
          {invitaciones.map(inv => (
            <div key={inv.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: `1px solid ${t.borderCard}`,
            }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: t.text }}>{inv.email}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: t.textMuted }}>
                  Rol: <span style={{ textTransform: 'capitalize' }}>{inv.role}</span> · Vence: {new Date(inv.expires_at).toLocaleDateString('es-AR')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{
                  background: COLORS.badge.pendiente.bg, color: COLORS.badge.pendiente.text,
                  padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                }}>Pendiente</span>
                <button onClick={() => cancelarInvitacion(inv.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: t.textMuted, fontSize: 20, padding: 6, borderRadius: 6, lineHeight: 1,
                }}
                  onMouseEnter={ev => { ev.currentTarget.style.color = COLORS.danger; ev.currentTarget.style.background = '#FFF1F2' }}
                  onMouseLeave={ev => { ev.currentTarget.style.color = t.textMuted; ev.currentTarget.style.background = 'none' }}
                >×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal invitar */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 20px', fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Invitar empleado</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Email del empleado</p>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="empleado@ejemplo.com" style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Rol</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {Object.keys(ROLES_PRESET).map(r => {
                    const active = form.role === r
                    return (
                      <button key={r} onClick={() => { setForm(p => ({ ...p, role: r })); setPermisos(ROLES_PRESET[r]) }}
                        style={{
                          background: active ? COLORS.primary : 'transparent',
                          color: active ? '#fff' : t.textMuted,
                          border: `1px solid ${active ? COLORS.primary : t.border}`,
                          borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                          fontSize: 13, fontWeight: active ? 700 : 500, textTransform: 'capitalize',
                        }}>
                        {r}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{
                background: isDark ? 'rgba(94,234,212,0.06)' : '#F0FDFA',
                border: `1px solid ${t.borderCard}`,
                borderRadius: 10, padding: '12px 16px',
              }}>
                <p style={{ margin: '0 0 10px', fontSize: 11, color: t.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Permisos del rol</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {Object.entries(PERMISOS_LABELS).map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ color: permisos[key] ? COLORS.success : t.textMuted, fontWeight: 800, fontSize: 14 }}>
                        {permisos[key] ? '✓' : '✗'}
                      </span>
                      <span style={{ color: permisos[key] ? t.text : t.textMuted }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={() => setModal(false)} style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '10px 18px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
              }}>Cancelar</button>
              <button onClick={invitar} style={{
                background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
              }}>Enviar invitación</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal permisos */}
      {editando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 460,
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 20px', fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>
              Permisos de {editando.full_name}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(PERMISOS_LABELS).map(([key, label]) => (
                <label key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: isDark ? 'rgba(94,234,212,0.04)' : '#F0FDFA',
                  border: `1px solid ${t.borderCard}`, borderRadius: 8, cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 14, color: t.text }}>{label}</span>
                  <div
                    onClick={() => setPermisos(p => ({ ...p, [key]: !p[key] }))}
                    style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: permisos[key] ? COLORS.primary : (isDark ? 'rgba(255,255,255,0.1)' : '#CCFBF1'),
                      position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3, left: permisos[key] ? 23 : 3,
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }} />
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={() => setEditando(null)} style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '10px 18px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
              }}>Cancelar</button>
              <button onClick={() => actualizarPermisos(editando.id, permisos)} style={{
                background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
              }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Paywall mostrado cuando la org no es Premium. Usa el NavContext del
// layout para saltar a Configuracion (navegacion SPA, no full reload).
function PaywallPremium({ textoTema }: { textoTema: ReturnType<typeof getTheme> }) {
  const { setPage } = useNav()
  const t = textoTema
  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>
        Gestión de empleados
      </p>
      <div style={{
        marginTop: 32, textAlign: 'center',
        background: t.card, border: `1px solid ${t.borderCard}`,
        borderRadius: 16, padding: 56,
      }}>
        <p style={{ fontSize: 44, marginBottom: 16 }}>👥</p>
        <p style={{ fontWeight: 800, fontSize: 20, color: t.text, marginBottom: 10 }}>
          Función exclusiva del plan Premium
        </p>
        <p style={{ color: t.textMuted, fontSize: 14, marginBottom: 24, lineHeight: 1.6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
          Con Stockio Premium podés agregar empleados ilimitados, asignarles roles y que todos vean el mismo stock en tiempo real.
        </p>
        <button
          onClick={() => setPage('configuracion')}
          style={{
            background: COLORS.primary, color: '#fff', borderRadius: 10,
            padding: '12px 28px', border: 'none', fontWeight: 700, fontSize: 14,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
            cursor: 'pointer',
          }}
        >
          Actualizar a Premium
        </button>
      </div>
    </div>
  )
}
