'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

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

const inp: React.CSSProperties = {
  background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, padding: '9px 12px', color: '#F0EFF8',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

export default function CuotasPage() {
  const [cuotas, setCuotas] = useState<CuotaVenta[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState<CuotaVenta | null>(null)
  const [generandoLink, setGenerandoLink] = useState(false)
  const [filtro, setFiltro] = useState('todas')

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
    setCuotas(data ?? [])
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
    const { error } = await supabase.from('cuotas_ventas').insert({
      ...form,
      monto_total: montoConInteres,
      monto_cuota: montoCuota,
      cantidad_cuotas: +form.cantidad_cuotas,
      interes_pct: +form.interes_pct,
    })
    if (error) { alert(error.message); return }
    setModal(false)
    setForm({ cliente_nombre: '', cliente_email: '', cliente_tel: '', monto_total: '', cantidad_cuotas: '3', interes_pct: '0', frecuencia: 'mensual', fecha_inicio: new Date().toISOString().split('T')[0] })
    fetchCuotas()
  }

  const registrarPago = async (cuotaPagoId: string, cuotaVentaId: string, monto: number) => {
    await supabase.from('cuota_pagos').update({
      estado: 'pagada',
      fecha_pago: new Date().toISOString().split('T')[0],
      metodo_pago: 'efectivo',
    }).eq('id', cuotaPagoId)

    const cv = cuotas.find(c => c.id === cuotaVentaId)
    if (cv) {
      const nuevoPagado = cv.monto_pagado + monto
      const nuevasCuotasPagadas = cv.cuotas_pagadas + 1
      await supabase.from('cuotas_ventas').update({
        monto_pagado: nuevoPagado,
        cuotas_pagadas: nuevasCuotasPagadas,
        estado: nuevasCuotasPagadas >= cv.cantidad_cuotas ? 'completada' : 'activa',
      }).eq('id', cuotaVentaId)
    }
    fetchCuotas()
    if (detalle?.id === cuotaVentaId) {
      const updated = cuotas.find(c => c.id === cuotaVentaId)
      if (updated) setDetalle(updated)
    }
  }

  const generarLinkMP = async (cv: CuotaVenta) => {
    setGenerandoLink(true)
    try {
      const res = await window.fetch('/api/cuotas/link-pago', {
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
        window.open(data.link, '_blank')
        fetchCuotas()
      }
    } catch { alert('Error generando link') }
    setGenerandoLink(false)
  }

  const filtradas = cuotas.filter(c => filtro === 'todas' ? true : c.estado === filtro)
  const totalPorCobrar = cuotas.reduce((a, c) => a + (c.monto_total - c.monto_pagado), 0)
  const enMora = cuotas.filter(c => c.estado === 'mora').length

  const estadoColor = (e: string) => ({
    activa: { bg: 'rgba(34,201,122,0.12)', color: '#22C97A' },
    completada: { bg: 'rgba(59,142,234,0.12)', color: '#3B8EEA' },
    mora: { bg: 'rgba(224,85,85,0.12)', color: '#E05555' },
    cancelada: { bg: 'rgba(120,120,140,0.12)', color: '#7A7A95' },
  }[e] ?? { bg: 'rgba(224,160,48,0.12)', color: '#E0A030' })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Cuotas y créditos</p>
          <p style={{ margin: 0, fontSize: 13, color: '#7A7A95' }}>{cuotas.length} planes de pago registrados</p>
        </div>
        <button onClick={() => setModal(true)} style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Nueva cuota
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total por cobrar', value: fmt(totalPorCobrar), color: '#3B8EEA' },
          { label: 'Planes activos', value: cuotas.filter(c => c.estado === 'activa').length, color: '#22C97A' },
          { label: 'En mora', value: enMora, color: enMora > 0 ? '#E05555' : '#22C97A' },
          { label: 'Completados', value: cuotas.filter(c => c.estado === 'completada').length, color: '#7A7A95' },
        ].map(m => (
          <div key={m.label} style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 600, color: m.color as string }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
          {['todas','activa','mora','completada'].map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{ background: filtro === f ? 'rgba(124,111,224,0.15)' : 'transparent', color: filtro === f ? '#7C6FE0' : '#7A7A95', border: `1px solid ${filtro === f ? 'rgba(124,111,224,0.6)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: filtro === f ? 600 : 400, textTransform: 'capitalize' }}>{f}</button>
          ))}
        </div>

        {loading ? <p style={{ padding: 40, textAlign: 'center', color: '#7A7A95' }}>Cargando...</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{['Cliente', 'Total', 'Pagado', 'Cuotas', 'Próx. venc.', 'Estado', 'Acciones'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7A7A95', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtradas.map(c => {
                const ec = estadoColor(c.estado)
                const progreso = c.cantidad_cuotas > 0 ? (c.cuotas_pagadas / c.cantidad_cuotas) * 100 : 0
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <p style={{ margin: 0, fontWeight: 500 }}>{c.cliente_nombre}</p>
                      {c.cliente_tel && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A7A95' }}>{c.cliente_tel}</p>}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600 }}>{fmt(c.monto_total)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <p style={{ margin: '0 0 4px', color: '#22C97A' }}>{fmt(c.monto_pagado)}</p>
                      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, width: 80 }}>
                        <div style={{ background: '#22C97A', borderRadius: 4, height: 4, width: `${progreso}%`, transition: 'width 0.3s' }} />
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#7A7A95' }}>{c.cuotas_pagadas}/{c.cantidad_cuotas} × {fmt(c.monto_cuota)}</td>
                    <td style={{ padding: '12px 14px', color: c.estado === 'mora' ? '#E05555' : '#7A7A95' }}>{c.proximo_venc ?? '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: ec.bg, color: ec.color, padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{c.estado}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setDetalle(c)} style={{ background: 'rgba(124,111,224,0.15)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#7C6FE0', fontSize: 12, fontWeight: 500 }}>Ver</button>
                        <button onClick={() => generarLinkMP(c)} disabled={generandoLink} style={{ background: 'rgba(34,201,122,0.12)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#22C97A', fontSize: 12, fontWeight: 500 }}>Link MP</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL DETALLE */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{detalle.cliente_nombre}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7A7A95' }}>{detalle.cantidad_cuotas} cuotas de {fmt(detalle.monto_cuota)} · {detalle.frecuencia}</p>
              </div>
              <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95', fontSize: 20 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Total', value: fmt(detalle.monto_total) },
                { label: 'Pagado', value: fmt(detalle.monto_pagado), color: '#22C97A' },
                { label: 'Saldo', value: fmt(detalle.monto_total - detalle.monto_pagado), color: '#E0A030' },
              ].map(m => (
                <div key={m.label} style={{ background: '#1E1E26', borderRadius: 10, padding: '12px 14px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#7A7A95', textTransform: 'uppercase' }}>{m.label}</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: m.color ?? '#F0EFF8' }}>{m.value}</p>
                </div>
              ))}
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Detalle de cuotas</p>
            {(detalle.cuota_pagos ?? []).sort((a, b) => a.nro_cuota - b.nro_cuota).map(cp => (
              <div key={cp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: cp.estado === 'pagada' ? 'rgba(34,201,122,0.12)' : cp.estado === 'vencida' ? 'rgba(224,85,85,0.12)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: cp.estado === 'pagada' ? '#22C97A' : cp.estado === 'vencida' ? '#E05555' : '#7A7A95' }}>
                    {cp.nro_cuota}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{fmt(cp.monto)}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A7A95' }}>Vence: {cp.fecha_venc}{cp.fecha_pago ? ` · Pagada: ${cp.fecha_pago}` : ''}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: cp.estado === 'pagada' ? 'rgba(34,201,122,0.12)' : cp.estado === 'vencida' ? 'rgba(224,85,85,0.12)' : 'rgba(224,160,48,0.12)', color: cp.estado === 'pagada' ? '#22C97A' : cp.estado === 'vencida' ? '#E05555' : '#E0A030', textTransform: 'capitalize' }}>{cp.estado}</span>
                  {cp.estado !== 'pagada' && (
                    <button onClick={() => registrarPago(cp.id, detalle.id, cp.monto)} style={{ background: '#7C6FE0', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 500 }}>
                      Cobrar
                    </button>
                  )}
                </div>
              </div>
            ))}

            {detalle.cliente_email && (
              <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                <button onClick={() => generarLinkMP(detalle)} style={{ flex: 1, background: 'rgba(34,201,122,0.12)', border: '1px solid rgba(34,201,122,0.3)', borderRadius: 8, padding: '10px', cursor: 'pointer', color: '#22C97A', fontSize: 13, fontWeight: 600 }}>
                  🔗 Generar link de pago MP
                </button>
                {detalle.mp_link_pago && (
                  <button onClick={() => navigator.clipboard.writeText(detalle.mp_link_pago!)} style={{ background: 'rgba(59,142,234,0.12)', border: '1px solid rgba(59,142,234,0.3)', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', color: '#3B8EEA', fontSize: 13, fontWeight: 600 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 500 }}>
            <p style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600 }}>Nuevo plan de cuotas</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Nombre del cliente</p>
                  <input value={form.cliente_nombre} onChange={e => setForm(p => ({...p, cliente_nombre: e.target.value}))} style={inp} />
                </div>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Email (para link MP)</p>
                  <input type="email" value={form.cliente_email} onChange={e => setForm(p => ({...p, cliente_email: e.target.value}))} style={inp} />
                </div>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Teléfono</p>
                  <input value={form.cliente_tel} onChange={e => setForm(p => ({...p, cliente_tel: e.target.value}))} style={inp} />
                </div>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Monto total ($)</p>
                  <input type="number" value={form.monto_total} onChange={e => setForm(p => ({...p, monto_total: e.target.value}))} style={inp} />
                </div>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Interés (%)</p>
                  <input type="number" value={form.interes_pct} onChange={e => setForm(p => ({...p, interes_pct: e.target.value}))} style={inp} />
                </div>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Cantidad de cuotas</p>
                  <input type="number" value={form.cantidad_cuotas} onChange={e => setForm(p => ({...p, cantidad_cuotas: e.target.value}))} style={inp} />
                </div>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Frecuencia</p>
                  <select value={form.frecuencia} onChange={e => setForm(p => ({...p, frecuencia: e.target.value}))} style={inp}>
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Fecha inicio</p>
                  <input type="date" value={form.fecha_inicio} onChange={e => setForm(p => ({...p, fecha_inicio: e.target.value}))} style={inp} />
                </div>
              </div>

              {montoConInteres > 0 && +form.cantidad_cuotas > 0 && (
                <div style={{ background: 'rgba(124,111,224,0.1)', border: '1px solid rgba(124,111,224,0.3)', borderRadius: 8, padding: '12px 16px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#7A7A95' }}>Resumen del plan</p>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#B4A8FF' }}>
                    {form.cantidad_cuotas} cuotas de {fmt(montoCuota)} · Total: {fmt(montoConInteres)}
                    {+form.interes_pct > 0 && <span style={{ fontSize: 12, color: '#7A7A95' }}> (incluye {form.interes_pct}% interés)</span>}
                  </p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', color: '#7A7A95', fontSize: 13 }}>Cancelar</button>
              <button onClick={save} style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Crear plan de cuotas</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}