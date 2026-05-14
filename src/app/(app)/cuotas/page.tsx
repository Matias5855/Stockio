'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getTheme, COLORS } from '@/lib/theme'
import { logHistorial } from '@/lib/historial'

const fmt = (n: number) => '$' + Number(n).toLocaleString('es-AR')
const supabase = createClient()

type CuotaPago = {
  id: string
  nro_cuota: number
  monto: number
  fecha_venc: string
  fecha_pago: string | null
  estado: 'pendiente' | 'pagada' | 'vencida'
  metodo_pago: string
  mp_payment_id: string | null
}

type CuotaVenta = {
  id: string
  cliente_nombre: string
  cliente_email: string | null
  cliente_tel: string | null
  monto_total: number
  monto_pagado: number
  cantidad_cuotas: number
  cuotas_pagadas: number
  monto_cuota: number
  interes_pct: number
  frecuencia: string
  estado: string
  proximo_venc: string | null
  mp_link_pago: string | null
  cuota_pagos?: CuotaPago[]
}

export default function CuotasPage() {
  const [cuotas, setCuotas] = useState<CuotaVenta[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState<CuotaVenta | null>(null)
  const [generandoLink, setGenerandoLink] = useState(false)
  const [filtro, setFiltro] = useState('todas')

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('sf_dark_mode') === '1')
    sync()
    const interval = setInterval(sync, 500)
    return () => clearInterval(interval)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  const [form, setForm] = useState({
    cliente_nombre: '', cliente_email: '', cliente_tel: '',
    monto_total: '', cantidad_cuotas: '3', interes_pct: '0',
    frecuencia: 'mensual', fecha_inicio: new Date().toISOString().split('T')[0],
  })

  const fetchCuotas = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('cuotas_ventas')
      .select('*, cuota_pagos(*)')
      .order('created_at', { ascending: false })
    setCuotas((data ?? []) as CuotaVenta[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCuotas() }, [fetchCuotas])

  const montoConInteres = form.monto_total && form.interes_pct
    ? +form.monto_total * (1 + +form.interes_pct / 100)
    : +form.monto_total || 0

  const montoCuota = form.cantidad_cuotas
    ? montoConInteres / +form.cantidad_cuotas
    : 0

  const save = async () => {
    if (!form.cliente_nombre || !form.monto_total) return
    const orgId = localStorage.getItem('sf_org_id')
    if (!orgId) return alert('Error: no se encontró la organización')

    // 1. Insertar el plan de cuotas (necesito el id para vincular la venta)
    const { data: cuotaCreada, error } = await supabase.from('cuotas_ventas').insert({
      ...form,
      org_id: orgId,
      monto_total: montoConInteres,
      monto_cuota: montoCuota,
      cantidad_cuotas: +form.cantidad_cuotas,
      interes_pct: +form.interes_pct,
    }).select().single()
    if (error) { alert(error.message); return }

    // 2. Crear venta vinculada con estado pendiente.
    // Uso nro_factura "CTA-{primeros 8 chars del id}" para poder volver a
    // encontrarla al cobrar la ultima cuota sin necesitar columna extra.
    if (cuotaCreada?.id) {
      const cuotaIdShort = String(cuotaCreada.id).slice(0, 8).toUpperCase()
      await supabase.from('ventas').insert({
        org_id: orgId,
        nro_factura: `CTA-${cuotaIdShort}`,
        cliente_nombre: form.cliente_nombre,
        fecha: form.fecha_inicio,
        estado: 'pendiente',
        subtotal: montoConInteres,
        descuento: 0,
        total: montoConInteres,
        notas: `Plan de cuotas: ${form.cantidad_cuotas} pagos de ${fmt(montoCuota)} (${form.frecuencia})`,
      })
      logHistorial({
        accion: 'crear', entidad: 'cuota_plan', entidad_id: cuotaCreada.id,
        descripcion: `Plan de cuotas creado: ${form.cliente_nombre} · ${form.cantidad_cuotas} × ${fmt(montoCuota)} = ${fmt(montoConInteres)}`,
      })
    }

    setModal(false)
    setForm({ cliente_nombre: '', cliente_email: '', cliente_tel: '', monto_total: '', cantidad_cuotas: '3', interes_pct: '0', frecuencia: 'mensual', fecha_inicio: new Date().toISOString().split('T')[0] })
    fetchCuotas()
  }

  const registrarPago = async (cuotaPagoId: string, cuotaVentaId: string, monto: number) => {
    const orgId = localStorage.getItem('sf_org_id')
    await supabase.from('cuota_pagos').update({
      estado: 'pagada',
      fecha_pago: new Date().toISOString().split('T')[0],
      metodo_pago: 'efectivo',
    }).eq('id', cuotaPagoId)

    const cv = cuotas.find(c => c.id === cuotaVentaId)
    if (cv) {
      const nuevoPagado = cv.monto_pagado + monto
      const nuevasCuotasPagadas = cv.cuotas_pagadas + 1
      const completada = nuevasCuotasPagadas >= cv.cantidad_cuotas

      await supabase.from('cuotas_ventas').update({
        monto_pagado: nuevoPagado,
        cuotas_pagadas: nuevasCuotasPagadas,
        estado: completada ? 'completada' : 'activa',
      }).eq('id', cuotaVentaId)

      if (orgId) {
        await supabase.from('movimientos').insert({
          descripcion: `Cobro cuota ${cv.cliente_nombre} (${nuevasCuotasPagadas}/${cv.cantidad_cuotas})`,
          tipo: 'ingreso',
          categoria_nombre: 'Cuotas',
          monto,
          fecha: new Date().toISOString().split('T')[0],
          org_id: orgId,
          venta_id: null,
        })
      }

      // Si se completaron todas las cuotas → marcar la venta vinculada como cobrada
      if (completada) {
        const cuotaIdShort = String(cuotaVentaId).slice(0, 8).toUpperCase()
        await supabase.from('ventas')
          .update({ estado: 'cobrada' })
          .eq('nro_factura', `CTA-${cuotaIdShort}`)
      }

      logHistorial({
        accion: 'cobrar', entidad: 'cuota_pago', entidad_id: cuotaPagoId,
        descripcion: `Cobro de cuota ${nuevasCuotasPagadas}/${cv.cantidad_cuotas} de ${cv.cliente_nombre} ($${monto.toLocaleString('es-AR')})${completada ? ' — PLAN COMPLETADO' : ''}`,
      })
    }
    fetchCuotas()
    if (detalle?.id === cuotaVentaId) {
      const updated = cuotas.find(c => c.id === cuotaVentaId)
      if (updated) setDetalle(updated)
    }
  }

  const [qrModal, setQrModal] = useState<{ link: string; nombre: string; monto: number } | null>(null)
  const generarLinkMP = async (cv: CuotaVenta) => {
    setGenerandoLink(true)
    try {
      const res = await fetch('/api/cuotas/link-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuota_venta_id: cv.id,
          cliente_email: cv.cliente_email,
          monto: cv.monto_cuota,
          descripcion: `Cuota — ${cv.cliente_nombre}`,
        }),
      })
      const data = await res.json()
      if (data.link) {
        await supabase.from('cuotas_ventas').update({ mp_link_pago: data.link }).eq('id', cv.id)
        setQrModal({ link: data.link, nombre: cv.cliente_nombre, monto: cv.monto_cuota })
        fetchCuotas()
      } else {
        alert(data.error ?? 'Error generando link de pago')
      }
    } catch { alert('Error generando link') }
    setGenerandoLink(false)
  }

  const filtradas = cuotas.filter(c => filtro === 'todas' ? true : c.estado === filtro)
  const totalPorCobrar = cuotas.reduce((a, c) => a + (c.monto_total - c.monto_pagado), 0)
  const enMora = cuotas.filter(c => c.estado === 'mora').length

  const estadoBadge = (e: string): { bg: string; text: string } => {
    switch (e) {
      case 'activa':     return COLORS.badge.ok
      case 'completada': return { bg: '#DBEAFE', text: '#1E40AF' }
      case 'mora':       return COLORS.badge.error
      case 'cancelada':  return { bg: '#F3F4F6', text: '#6B7280' }
      default:           return COLORS.badge.pendiente
    }
  }

  const inp: React.CSSProperties = {
    background: t.card,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: t.text,
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '12px 14px',
    fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    color: isDark ? '#5EEAD4' : '#115E59',
    background: isDark ? 'rgba(94,234,212,0.08)' : '#99F6E4',
    borderBottom: `1px solid ${t.borderMid}`,
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Cuotas y créditos</p>
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>{cuotas.length} planes de pago registrados</p>
        </div>
        <button onClick={() => setModal(true)} style={{
          background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
          boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
        }}>
          + Nueva cuota
        </button>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Por cobrar',  value: fmt(totalPorCobrar), palette: COLORS.metric.saldo },
          { label: 'Activos',     value: String(cuotas.filter(c => c.estado === 'activa').length), palette: COLORS.metric.ventas },
          { label: 'En mora',     value: String(enMora), palette: enMora > 0 ? COLORS.metric.pendiente : COLORS.metric.ventas },
          { label: 'Completados', value: String(cuotas.filter(c => c.estado === 'completada').length), palette: COLORS.metric.saldo },
        ].map(m => (
          <div key={m.label} style={{
            background: m.palette.bg, border: `1px solid ${m.palette.border}`,
            borderRadius: 12, padding: '16px 18px',
          }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: m.palette.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {m.label}
            </p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: m.palette.value }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderBottom: `1px solid ${t.borderCard}`, flexWrap: 'wrap' }}>
          {['todas','activa','mora','completada'].map(f => {
            const active = filtro === f
            return (
              <button key={f} onClick={() => setFiltro(f)} style={{
                background: active ? COLORS.primary : 'transparent',
                color: active ? '#fff' : t.textMuted,
                border: `1px solid ${active ? COLORS.primary : t.border}`,
                borderRadius: 7, padding: '6px 14px', fontSize: 12,
                cursor: 'pointer', fontWeight: active ? 700 : 500,
                textTransform: 'capitalize', transition: 'all 0.12s',
              }}>{f}</button>
            )
          })}
        </div>

        {loading ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted }}>Cargando…</p>
        ) : filtradas.length === 0 ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
            {cuotas.length === 0 ? 'Sin planes de cuotas. Creá el primero con "+ Nueva cuota".' : 'Sin resultados para este filtro.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{['Cliente', 'Total', 'Pagado', 'Cuotas', 'Próx. venc.', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {filtradas.map((c, i) => {
                  const badge = estadoBadge(c.estado)
                  const progreso = c.cantidad_cuotas > 0 ? (c.cuotas_pagadas / c.cantidad_cuotas) * 100 : 0
                  const evenRow = i % 2 === 0
                  return (
                    <tr key={c.id} style={{
                      background: evenRow ? t.card : (isDark ? 'rgba(94,234,212,0.04)' : '#F0FDFA'),
                    }}>
                      <td style={{ padding: '12px 14px' }}>
                        <p style={{ margin: 0, fontWeight: 600, color: t.text }}>{c.cliente_nombre}</p>
                        {c.cliente_tel && <p style={{ margin: '2px 0 0', fontSize: 11, color: t.textMuted }}>{c.cliente_tel}</p>}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: t.text }}>{fmt(c.monto_total)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <p style={{ margin: '0 0 4px', color: COLORS.success, fontWeight: 600 }}>{fmt(c.monto_pagado)}</p>
                        <div style={{ background: isDark ? 'rgba(255,255,255,0.08)' : '#CCFBF1', borderRadius: 4, height: 4, width: 80 }}>
                          <div style={{ background: COLORS.success, borderRadius: 4, height: 4, width: `${progreso}%`, transition: 'width 0.3s' }} />
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: t.textMuted }}>
                        {c.cuotas_pagadas}/{c.cantidad_cuotas} × {fmt(c.monto_cuota)}
                      </td>
                      <td style={{ padding: '12px 14px', color: c.estado === 'mora' ? COLORS.danger : t.textMuted }}>
                        {c.proximo_venc ?? '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          background: badge.bg, color: badge.text,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          textTransform: 'capitalize', display: 'inline-block',
                        }}>{c.estado}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setDetalle(c)} style={{
                            background: '#CCFBF1', border: 'none', borderRadius: 6,
                            padding: '5px 12px', cursor: 'pointer',
                            color: COLORS.primary, fontSize: 12, fontWeight: 700,
                          }}>Ver</button>
                          <button onClick={() => generarLinkMP(c)} disabled={generandoLink} style={{
                            background: COLORS.badge.ok.bg, border: 'none', borderRadius: 6,
                            padding: '5px 12px', cursor: 'pointer',
                            color: COLORS.badge.ok.text, fontSize: 12, fontWeight: 700,
                          }}>Link MP</button>
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

      {/* MODAL DETALLE */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: t.text }}>{detalle.cliente_nombre}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: t.textMuted }}>
                  {detalle.cantidad_cuotas} cuotas de {fmt(detalle.monto_cuota)} · {detalle.frecuencia}
                </p>
              </div>
              <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 22 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Total', value: fmt(detalle.monto_total), palette: COLORS.metric.saldo },
                { label: 'Pagado', value: fmt(detalle.monto_pagado), palette: COLORS.metric.ventas },
                { label: 'Saldo', value: fmt(detalle.monto_total - detalle.monto_pagado), palette: COLORS.metric.stock },
              ].map(m => (
                <div key={m.label} style={{
                  background: m.palette.bg, border: `1px solid ${m.palette.border}`,
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10, color: m.palette.label, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>{m.label}</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: m.palette.value }}>{m.value}</p>
                </div>
              ))}
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Detalle de cuotas
            </p>
            {(detalle.cuota_pagos ?? []).sort((a, b) => a.nro_cuota - b.nro_cuota).map(cp => {
              const cpBadge =
                cp.estado === 'pagada' ? COLORS.badge.ok :
                cp.estado === 'vencida' ? COLORS.badge.error :
                COLORS.badge.pendiente
              return (
                <div key={cp.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0', borderBottom: `1px solid ${t.borderCard}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: cpBadge.bg, color: cpBadge.text,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800,
                    }}>
                      {cp.nro_cuota}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.text }}>{fmt(cp.monto)}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: t.textMuted }}>
                        Vence: {cp.fecha_venc}{cp.fecha_pago ? ` · Pagada: ${cp.fecha_pago}` : ''}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                      background: cpBadge.bg, color: cpBadge.text, textTransform: 'capitalize',
                    }}>{cp.estado}</span>
                    {cp.estado !== 'pagada' && (
                      <button onClick={() => registrarPago(cp.id, detalle.id, cp.monto)} style={{
                        background: COLORS.primary, border: 'none', borderRadius: 6,
                        padding: '6px 14px', cursor: 'pointer', color: '#fff',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        Cobrar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {detalle.cliente_email && (
              <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                <button onClick={() => generarLinkMP(detalle)} style={{
                  flex: 1, background: COLORS.badge.ok.bg, border: `1px solid #86EFAC`,
                  borderRadius: 8, padding: '10px', cursor: 'pointer',
                  color: COLORS.badge.ok.text, fontSize: 13, fontWeight: 700,
                }}>
                  🔗 Generar link de pago MP
                </button>
                {detalle.mp_link_pago && (
                  <button onClick={() => navigator.clipboard.writeText(detalle.mp_link_pago!)} style={{
                    background: '#DBEAFE', border: `1px solid #93C5FD`, borderRadius: 8,
                    padding: '10px 16px', cursor: 'pointer',
                    color: '#1E40AF', fontSize: 13, fontWeight: 700,
                  }}>
                    📋 Copiar link
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL NUEVA CUOTA */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 520,
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 20px', fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Nuevo plan de cuotas</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Nombre del cliente</p>
                <input value={form.cliente_nombre} onChange={e => setForm(p => ({...p, cliente_nombre: e.target.value}))} style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Email (link MP)</p>
                <input type="email" value={form.cliente_email} onChange={e => setForm(p => ({...p, cliente_email: e.target.value}))} style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Teléfono</p>
                <input value={form.cliente_tel} onChange={e => setForm(p => ({...p, cliente_tel: e.target.value}))} style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Monto total ($)</p>
                <input type="number" value={form.monto_total} onChange={e => setForm(p => ({...p, monto_total: e.target.value}))} style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Interés (%)</p>
                <input type="number" value={form.interes_pct} onChange={e => setForm(p => ({...p, interes_pct: e.target.value}))} style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Cantidad de cuotas</p>
                <input type="number" value={form.cantidad_cuotas} onChange={e => setForm(p => ({...p, cantidad_cuotas: e.target.value}))} style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Frecuencia</p>
                <select value={form.frecuencia} onChange={e => setForm(p => ({...p, frecuencia: e.target.value}))} style={inp}>
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Fecha inicio</p>
                <input type="date" value={form.fecha_inicio} onChange={e => setForm(p => ({...p, fecha_inicio: e.target.value}))} style={inp} />
              </div>
            </div>

            {montoConInteres > 0 && +form.cantidad_cuotas > 0 && (
              <div style={{
                background: COLORS.metric.ventas.bg, border: `1px solid ${COLORS.metric.ventas.border}`,
                borderRadius: 10, padding: '12px 16px', marginTop: 14,
              }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: COLORS.metric.ventas.label, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resumen</p>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.metric.ventas.value }}>
                  {form.cantidad_cuotas} × {fmt(montoCuota)} · Total: {fmt(montoConInteres)}
                  {+form.interes_pct > 0 && <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 500 }}> ({form.interes_pct}% interés)</span>}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={() => setModal(false)} style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '10px 18px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
              }}>Cancelar</button>
              <button onClick={save} style={{
                background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
              }}>Crear plan</button>
            </div>
          </div>
        </div>
      )}

      {/* QR MODAL */}
      {qrModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 380, textAlign: 'center',
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: t.text }}>Cobro a {qrModal.nombre}</p>
            <p style={{ margin: '0 0 20px', fontSize: 16, color: COLORS.success, fontWeight: 700 }}>${qrModal.monto.toLocaleString('es-AR')}</p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: t.textMuted }}>El cliente escanea este QR con la app de Mercado Pago</p>

            <Image
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrModal.link)}&margin=16`}
              alt="QR de pago"
              width={220}
              height={220}
              unoptimized
              style={{ borderRadius: 12, border: `3px solid ${COLORS.primary}`, marginBottom: 16 }}
            />

            <p style={{ margin: '0 0 16px', fontSize: 11, color: t.textMuted }}>
              También puede pagar con tarjeta abriendo el link
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => navigator.clipboard.writeText(qrModal.link).then(() => alert('Link copiado'))} style={{
                background: '#CCFBF1', border: `1px solid ${COLORS.primary}`, borderRadius: 8,
                padding: '8px 16px', color: COLORS.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                📋 Copiar
              </button>
              <a href={qrModal.link} target="_blank" rel="noreferrer" style={{
                background: '#DBEAFE', border: `1px solid #93C5FD`, borderRadius: 8,
                padding: '8px 16px', color: '#1E40AF', fontSize: 12, fontWeight: 700, textDecoration: 'none',
              }}>
                🔗 Abrir
              </a>
              <button onClick={() => setQrModal(null)} style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '8px 16px', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontWeight: 600,
              }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
