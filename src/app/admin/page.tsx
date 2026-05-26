'use client'

/**
 * Panel de admin para el dueño de Stockio.
 *
 * Solo accesible si profiles.is_site_admin = true (validado por layout.tsx
 * server-side antes de renderizar). Muestra:
 *  - MRR + funnel de registro -> trial -> activa
 *  - Trials por vencer en los proximos 7 dias
 *  - Lista de todas las organizaciones con acciones (extender / cambiar plan / cancelar)
 *
 * Toda la data viene de GET /api/admin/overview en una sola call.
 * Las acciones pegan en POST /api/admin/action.
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { COLORS } from '@/lib/theme'

type Funnel = {
  total_orgs: number
  onboarding_completado: number
  trial: number
  activas: number
  vencidas: number
  canceladas: number
  pausadas: number
  total_profiles: number
}

type TrialPorVencer = {
  org_id: string
  org_name: string
  plan_id: string
  trial_fin: string
  dias_restantes: number
}

type Org = {
  id: string
  name: string
  created_at: string
  onboarding_completado: boolean
  plan_id: string | null
  estado: string
  trial_fin: string | null
}

type Overview = {
  mrr: number
  moneda: string
  funnel: Funnel
  trialesPorVencer: TrialPorVencer[]
  organizaciones: Org[]
}

const ESTADO_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  trial:           { bg: '#FEF3C7', color: '#92400E', label: 'Trial' },
  activa:          { bg: '#DCFCE7', color: '#166534', label: 'Activa' },
  vencida:         { bg: '#FEE2E2', color: '#991B1B', label: 'Vencida' },
  cancelada:       { bg: '#F3F4F6', color: '#374151', label: 'Cancelada' },
  pausada:         { bg: '#E0E7FF', color: '#3730A3', label: 'Pausada' },
  sin_suscripcion: { bg: '#F1F5F9', color: '#64748B', label: 'Sin suscripción' },
}

function fmtARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'orgs'>('overview')

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/overview')
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error cargando datos')
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const ejecutarAccion = async (body: Record<string, unknown>, descripcion: string) => {
    if (!confirm(`¿Confirmás: ${descripcion}?`)) return
    setActionLoading(String(body.org_id) + body.action)
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error en la acción')
      await cargar()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setActionLoading(null)
    }
  }

  const extenderTrial = (org: Org) => {
    const dias = prompt(`¿Cuántos días extender el trial de ${org.name}?`, '7')
    if (!dias) return
    ejecutarAccion(
      { action: 'extender_trial', org_id: org.id, dias: Number(dias) },
      `extender trial de ${org.name} por ${dias} días`,
    )
  }

  const cambiarPlan = (org: Org) => {
    const actual = org.plan_id ?? 'normal'
    const nuevo = actual === 'normal' ? 'premium' : 'normal'
    ejecutarAccion(
      { action: 'cambiar_plan', org_id: org.id, plan_id: nuevo },
      `cambiar plan de ${org.name} de ${actual} a ${nuevo}`,
    )
  }

  const cancelar = (org: Org) => {
    ejecutarAccion(
      { action: 'cancelar_suscripcion', org_id: org.id },
      `cancelar la suscripción de ${org.name}`,
    )
  }

  // Eliminar org — accion DESTRUCTIVA e IRREVERSIBLE.
  // Triple guard: confirm() inicial -> prompt pidiendo escribir el nombre exacto ->
  // confirm() final. Solo asi se llama al endpoint.
  const eliminar = async (org: Org) => {
    const warn = `⚠️ ELIMINAR PERMANENTEMENTE "${org.name}"\n\nEsto borra:\n• Todos los productos\n• Todas las ventas e items\n• Todos los movimientos de caja\n• Todas las cuotas y pagos\n• Todos los archivos (metadata)\n• Todos los usuarios vinculados\n• Toda la suscripción e historial\n\nNO se puede deshacer.\n\n¿Continuar?`
    if (!confirm(warn)) return

    const tipeado = prompt(`Para confirmar, escribí el nombre exacto del negocio:\n\n${org.name}`)
    if (tipeado === null) return  // cancelo el prompt
    if (tipeado !== org.name) {
      alert(`El nombre no coincide.\nEscribiste: "${tipeado}"\nEsperaba: "${org.name}"\n\nAcción cancelada.`)
      return
    }

    if (!confirm(`Última confirmación: eliminar "${org.name}" y TODOS sus datos. ¿Seguro?`)) return

    setActionLoading(org.id + 'eliminar')
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'eliminar_organizacion',
          org_id: org.id,
          confirm_name: org.name,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error eliminando')
      if (json.warnings?.length) {
        alert(`Org eliminada con advertencias:\n\n${json.warnings.join('\n')}`)
      }
      await cargar()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setActionLoading(null)
    }
  }

  // ---------- Estilos ----------
  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: '#F0FDFA',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#042F2E',
  }

  const header: React.CSSProperties = {
    background: '#FFFFFF', borderBottom: '1px solid #CCFBF1',
    padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }

  const main: React.CSSProperties = { padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }

  const card: React.CSSProperties = {
    background: '#FFFFFF', border: '1px solid #CCFBF1', borderRadius: 14,
    padding: 20, boxShadow: '0 2px 8px rgba(4,47,46,0.04)',
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '10px 18px',
    background: active ? COLORS.primary : 'transparent',
    color: active ? '#FFFFFF' : '#115E59',
    border: 'none', borderRadius: 10,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  })

  const actionBtn: React.CSSProperties = {
    background: '#F0FDFA', color: '#115E59',
    border: '1px solid #99F6E4', borderRadius: 8,
    padding: '6px 10px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  }

  if (loading) {
    return (
      <div style={wrap}>
        <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>Cargando datos del panel…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={wrap}>
        <div style={{ ...main, ...card, color: '#9F1239', background: '#FFF1F2', border: '1px solid #FECDD3', marginTop: 32 }}>
          {error}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={wrap}>
      <header style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, background: COLORS.primary, color: '#FFFFFF',
            borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 18,
          }}>S</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Stockio · Admin</h1>
            <p style={{ margin: 0, fontSize: 11, color: '#6B7280' }}>Panel interno · solo para el dueño</p>
          </div>
        </div>
        <Link href="/dashboard" style={{ fontSize: 13, color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
          ← Volver al dashboard
        </Link>
      </header>

      <div style={main}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
          <button onClick={() => setTab('overview')} style={tabBtn(tab === 'overview')}>Overview</button>
          <button onClick={() => setTab('orgs')} style={tabBtn(tab === 'orgs')}>
            Organizaciones ({data.organizaciones.length})
          </button>
        </div>

        {tab === 'overview' && (
          <>
            {/* Métricas grandes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 22 }}>
              <div style={{ ...card, background: 'linear-gradient(135deg, #0D9488 0%, #115E59 100%)', color: '#FFFFFF', border: 'none' }}>
                <p style={{ margin: 0, fontSize: 12, opacity: 0.9, fontWeight: 600 }}>MRR (Ingresos Mensuales)</p>
                <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{fmtARS(data.mrr)}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.85 }}>{data.funnel.activas} suscripciones activas</p>
              </div>

              <div style={card}>
                <p style={{ margin: 0, fontSize: 12, color: '#6B7280', fontWeight: 600 }}>Total Organizaciones</p>
                <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800 }}>{data.funnel.total_orgs}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6B7280' }}>{data.funnel.total_profiles} usuarios totales</p>
              </div>

              <div style={card}>
                <p style={{ margin: 0, fontSize: 12, color: '#6B7280', fontWeight: 600 }}>En Trial</p>
                <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: '#92400E' }}>{data.funnel.trial}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6B7280' }}>{data.trialesPorVencer.length} vencen esta semana</p>
              </div>

              <div style={card}>
                <p style={{ margin: 0, fontSize: 12, color: '#6B7280', fontWeight: 600 }}>Churn (Canceladas + Vencidas)</p>
                <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: '#991B1B' }}>{data.funnel.canceladas + data.funnel.vencidas}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6B7280' }}>{data.funnel.canceladas} canceladas · {data.funnel.vencidas} vencidas</p>
              </div>
            </div>

            {/* Funnel */}
            <div style={{ ...card, marginBottom: 22 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Funnel de conversión</h3>
              {[
                { label: 'Registros totales', value: data.funnel.total_orgs, pct: 100 },
                { label: 'Onboarding completado', value: data.funnel.onboarding_completado, pct: data.funnel.total_orgs ? (data.funnel.onboarding_completado / data.funnel.total_orgs) * 100 : 0 },
                { label: 'En trial activo', value: data.funnel.trial, pct: data.funnel.total_orgs ? (data.funnel.trial / data.funnel.total_orgs) * 100 : 0 },
                { label: 'Suscripción activa (pagando)', value: data.funnel.activas, pct: data.funnel.total_orgs ? (data.funnel.activas / data.funnel.total_orgs) * 100 : 0 },
              ].map((row) => (
                <div key={row.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{row.label}</span>
                    <span style={{ fontWeight: 700 }}>{row.value} <span style={{ color: '#6B7280', fontSize: 11 }}>({row.pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ background: '#F1F5F9', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      background: COLORS.primary, height: '100%',
                      width: `${row.pct}%`, transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Trials por vencer */}
            <div style={card}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>
                Trials que vencen en los próximos 7 días
                <span style={{ marginLeft: 8, padding: '2px 8px', background: '#FEF3C7', color: '#92400E', borderRadius: 6, fontSize: 12 }}>
                  {data.trialesPorVencer.length}
                </span>
              </h3>
              {data.trialesPorVencer.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>No hay trials por vencer esta semana. 🎉</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#99F6E4', color: '#115E59' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Negocio</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Plan</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Vence</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trialesPorVencer.map((t) => (
                      <tr key={t.org_id} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 12px' }}>{t.org_name}</td>
                        <td style={{ padding: '8px 12px', textTransform: 'capitalize' }}>{t.plan_id}</td>
                        <td style={{ padding: '8px 12px' }}>{fmtFecha(t.trial_fin)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12,
                            background: t.dias_restantes <= 2 ? '#FEE2E2' : '#FEF3C7',
                            color: t.dias_restantes <= 2 ? '#991B1B' : '#92400E',
                          }}>
                            {t.dias_restantes}d
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === 'orgs' && (
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#99F6E4', color: '#115E59' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Negocio</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Plan</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Estado</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Onb.</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Registrada</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Trial vence</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.organizaciones.map((o, i) => {
                  const badge = ESTADO_BADGE[o.estado] ?? ESTADO_BADGE.sin_suscripcion
                  return (
                    <tr key={o.id} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#F0FDFA', borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{o.name}</td>
                      <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>{o.plan_id ?? '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 11,
                          background: badge.bg, color: badge.color,
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{o.onboarding_completado ? '✓' : '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#6B7280' }}>{fmtFecha(o.created_at)}</td>
                      <td style={{ padding: '10px 12px', color: '#6B7280' }}>{fmtFecha(o.trial_fin)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => extenderTrial(o)}
                            disabled={!!actionLoading}
                            style={actionBtn}
                          >+ Trial</button>
                          <button
                            onClick={() => cambiarPlan(o)}
                            disabled={!!actionLoading}
                            style={actionBtn}
                          >Plan</button>
                          <button
                            onClick={() => cancelar(o)}
                            disabled={!!actionLoading || o.estado === 'cancelada'}
                            style={{ ...actionBtn, background: '#FEE2E2', color: '#991B1B', borderColor: '#FECACA' }}
                          >Cancelar</button>
                          <button
                            onClick={() => eliminar(o)}
                            disabled={!!actionLoading}
                            title="Eliminar org permanentemente (irreversible)"
                            style={{ ...actionBtn, background: '#991B1B', color: '#FFFFFF', borderColor: '#7F1D1D' }}
                          >🗑</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
