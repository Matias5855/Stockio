'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useVentas } from '@/lib/hooks/useVentas'
import { useStock } from '@/lib/hooks/useStock'
import { descargarTicket, TicketData } from '@/lib/ticket'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
import ExportarBtn from '@/components/ExportarBtn'
import { exportarVentasExcel, exportarVentasPDF } from '@/lib/exportar'
import { getTheme, COLORS } from '@/lib/theme'

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false })

const fmt = (n: number) => '$' + n.toLocaleString('es-AR')
const fmtK = (n: number) => n >= 1_000_000 ? '$' + (n/1_000_000).toFixed(1) + 'M' : n >= 1000 ? '$' + (n/1000).toFixed(0) + 'k' : '$' + n

type VentaItem = {
  producto_nombre: string
  cantidad: number
  precio_unitario: number
  subtotal?: number
}

type VentaRow = {
  id: string
  nro_factura: string
  fecha: string
  cliente_nombre: string | null
  total: number
  subtotal: number
  descuento: number
  notas?: string | null
  estado: 'cobrada' | 'pendiente' | 'cancelada'
  venta_items?: VentaItem[]
}

export default function VentasPage() {
  const { ventas, loading, crearVenta, cambiarEstado, deleteVenta } = useVentas()
  const { productos } = useStock()

  const [modal, setModal]           = useState(false)
  const [scanner, setScanner]       = useState(false)
  const [enviando, setEnviando]     = useState(false)
  const [emailModal, setEmailModal] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('sf_dark_mode') === '1')
    sync()
    const interval = setInterval(sync, 500)
    return () => clearInterval(interval)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  // Estado de ARCA: cargamos una vez al montar para saber si mostramos
  // el boton "Emitir con CAE" o no.
  const [arcaActivado, setArcaActivado] = useState(false)
  const [emitiendoCAE, setEmitiendoCAE] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/arca/configurar')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setArcaActivado(data.activado === true && data.tiene_certificado === true)
      })
      .catch(() => {})
  }, [])

  const emitirConCAE = async (venta_id: string) => {
    setEmitiendoCAE(venta_id)
    try {
      const res = await fetch('/api/factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venta_id, usar_arca: true }),
      })
      const data = await res.json()
      if (data.cae) {
        setMsg({ text: `✓ CAE obtenido: ${data.cae}`, ok: true })
      } else if (data.arca_error) {
        setMsg({ text: `ARCA: ${data.arca_error}`, ok: false })
      } else {
        setMsg({ text: data.error ?? 'Error emitiendo factura', ok: false })
      }
    } catch {
      setMsg({ text: 'Error de conexión con ARCA', ok: false })
    }
    setEmitiendoCAE(null)
    setTimeout(() => setMsg(null), 6000)
  }

  const [form, setForm] = useState({
    cliente_nombre: '', producto_id: '', cantidad: '1',
    precio_unitario: '', estado: 'cobrada' as 'cobrada' | 'pendiente',
  })

  const total = ventas.reduce((a, v) => a + v.total, 0)
  const cobradas = ventas.filter(v => v.estado === 'cobrada').reduce((a, v) => a + v.total, 0)
  const pendienteMonto = ventas.filter(v => v.estado === 'pendiente').reduce((a, v) => a + v.total, 0)
  const productoSel = productos.find(p => p.id === form.producto_id)
  const totalVenta = +form.cantidad * +form.precio_unitario

  const handleBarcode = (code: string) => {
    setScanner(false)
    const prod = productos.find(p => p.sku === code)
    if (prod) {
      setForm(f => ({ ...f, producto_id: prod.id, precio_unitario: String(prod.precio_venta) }))
      setModal(true)
    } else {
      alert(`Producto con SKU "${code}" no encontrado en el inventario.`)
    }
  }

  const handleBarcodeInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBarcode((e.target as HTMLInputElement).value);
      (e.target as HTMLInputElement).value = ''
    }
  }

  const save = async () => {
    if (!form.cliente_nombre || !form.producto_id) return
    try {
      await crearVenta({
        cliente_nombre: form.cliente_nombre,
        fecha: new Date().toISOString().split('T')[0],
        estado: form.estado,
        subtotal: totalVenta,
        descuento: 0,
        total: totalVenta,
        notas: null,
      }, [{
        producto_id: form.producto_id,
        producto_nombre: productoSel
          ? `${productoSel.nombre}${productoSel.talle ? ` — T: ${productoSel.talle}` : ''}${productoSel.color ? ` · ${productoSel.color}` : ''}`
          : '',
        cantidad: +form.cantidad,
        precio_unitario: +form.precio_unitario,
      }])
      setForm({ cliente_nombre: '', producto_id: '', cantidad: '1', precio_unitario: '', estado: 'cobrada' })
      setModal(false)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error')
    }
  }

  const descargarPDF = async (v: VentaRow) => {
    const supabase = createClient()
    const orgID = localStorage.getItem('sf_org_id')

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgID)
      .single()

    const orgData = (org ?? {}) as Record<string, unknown>

    // Si la venta no trae venta_items embebidos, los buscamos por separado.
    // Esto pasa por ejemplo con ventas generadas desde Cuotas (plan de pago).
    let itemsFromDb = v.venta_items ?? []
    if (itemsFromDb.length === 0) {
      const { data: itemsRows } = await supabase
        .from('venta_items')
        .select('*')
        .eq('venta_id', v.id)
      itemsFromDb = (itemsRows ?? []) as typeof itemsFromDb
    }

    // Mapeamos a items del ticket. Si AUN no hay items (ej: venta de plan
    // de cuotas), creamos un row generico con la info disponible para que
    // la factura no salga vacia.
    const items = itemsFromDb.length > 0
      ? itemsFromDb.map((i, idx) => ({
          codigo: String(idx + 1).padStart(3, '0'),
          nombre: i.producto_nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          subtotal: i.subtotal ?? i.cantidad * i.precio_unitario,
          unidad_medida: 'un',
          bonif_pct: 0,
          imp_bonif: 0,
        }))
      : [{
          codigo: '001',
          nombre: v.notas?.trim() || `Venta ${v.nro_factura}`,
          cantidad: 1,
          precio_unitario: v.total,
          subtotal: v.total,
          unidad_medida: 'un',
          bonif_pct: 0,
          imp_bonif: 0,
        }]

    const data: TicketData = {
      nro_factura: v.nro_factura,
      fecha: v.fecha,
      cliente_nombre: v.cliente_nombre ?? 'Consumidor Final',
      negocio_nombre: (orgData.name as string) ?? (orgData.nombre as string) ?? 'Mi Negocio',
      negocio_cuit: orgData.cuit as string | undefined,
      negocio_direccion: orgData.direccion as string | undefined,
      negocio_telefono: orgData.telefono as string | undefined,
      negocio_email: orgData.email_negocio as string | undefined,
      negocio_iibb: orgData.iibb as string | undefined,
      negocio_inicio_actividades: orgData.inicio_actividades as string | undefined,
      condicion_iva_emisor: (orgData.condicion_iva as string) ?? 'Responsable Monotributo',
      condicion_iva_receptor: 'Consumidor Final',
      condicion_venta: 'Contado',
      punto_venta: (orgData.punto_venta as string) ?? '0001',
      tipo_comprobante: 'C',
      items,
      subtotal: v.subtotal,
      descuento: v.descuento ?? 0,
      total: v.total,
    }
    descargarTicket(data)
  }

  const enviarEmail = async (venta_id: string) => {
    if (!emailInput) return
    setEnviando(true)
    try {
      const res = await fetch('/api/factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venta_id, email_cliente: emailInput, usar_arca: false }),
      })
      const data = await res.json()
      setMsg(data.ok
        ? { text: 'Email enviado correctamente ✓', ok: true }
        : { text: data.error ?? 'Error al enviar', ok: false }
      )
    } catch {
      setMsg({ text: 'Error de conexión', ok: false })
    }
    setEnviando(false)
    setEmailInput('')
    setEmailModal(null)
    setTimeout(() => setMsg(null), 4000)
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
    textAlign: 'left',
    padding: '12px 14px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: isDark ? '#5EEAD4' : '#115E59',
    background: isDark ? 'rgba(94,234,212,0.08)' : '#99F6E4',
    borderBottom: `1px solid ${t.borderMid}`,
  }

  return (
    <div>
      <input ref={barcodeRef} onKeyDown={handleBarcodeInput}
        style={{ position: 'fixed', opacity: 0, pointerEvents: 'none', top: 0 }} />

      {scanner && <BarcodeScanner onDetected={handleBarcode} onClose={() => setScanner(false)} />}

      {msg && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 3000,
          background: msg.ok ? COLORS.badge.ok.bg : COLORS.badge.error.bg,
          border: `1px solid ${msg.ok ? '#86EFAC' : '#FECDD3'}`,
          borderRadius: 10, padding: '12px 20px',
          color: msg.ok ? COLORS.badge.ok.text : COLORS.badge.error.text,
          fontSize: 13, fontWeight: 600,
        }}>
          {msg.text}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Ventas / Facturación</p>
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>{ventas.length} operaciones registradas</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <ExportarBtn
            onExcelClick={() => exportarVentasExcel(ventas, localStorage.getItem('sf_org_nombre') ?? 'Negocio')}
            onPDFClick={() => exportarVentasPDF(ventas, localStorage.getItem('sf_org_nombre') ?? 'Negocio')}
          />
          <button onClick={() => setScanner(true)} style={{
            background: '#CCFBF1', color: COLORS.primary,
            border: `1px solid ${COLORS.primary}`, borderRadius: 8,
            padding: '10px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
          }}>
            📷 Escanear
          </button>
          <button onClick={() => setModal(true)} style={{
            background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
          }}>
            + Registrar venta
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total facturado', value: fmtK(total),           palette: COLORS.metric.ventas },
          { label: 'Cobrado',         value: fmtK(cobradas),        palette: COLORS.metric.ventas },
          { label: 'Por cobrar',      value: fmtK(pendienteMonto),  palette: COLORS.metric.pendiente },
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

      {/* Tabla */}
      <div style={{ background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted }}>Cargando…</p>
        ) : ventas.length === 0 ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
            Sin ventas registradas. Empezá con &quot;+ Registrar venta&quot;.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Nro.', 'Fecha', 'Cliente', 'Total', 'Estado', 'Acciones'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ventas.map((v, i) => {
                  const evenRow = i % 2 === 0
                  return (
                    <tr key={v.id} style={{
                      background: evenRow ? t.card : (isDark ? 'rgba(94,234,212,0.04)' : '#F0FDFA'),
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(94,234,212,0.10)' : '#CCFBF1'}
                      onMouseLeave={e => e.currentTarget.style.background = evenRow ? t.card : (isDark ? 'rgba(94,234,212,0.04)' : '#F0FDFA')}
                    >
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: t.textMuted, fontSize: 12 }}>{v.nro_factura}</td>
                      <td style={{ padding: '12px 14px', color: t.textMuted }}>{v.fecha}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: t.text }}>{v.cliente_nombre}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: COLORS.success }}>{fmt(v.total)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          background: v.estado === 'cobrada' ? COLORS.badge.cobrada.bg : COLORS.badge.pendiente.bg,
                          color: v.estado === 'cobrada' ? COLORS.badge.cobrada.text : COLORS.badge.pendiente.text,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          display: 'inline-block',
                        }}>
                          {v.estado === 'cobrada' ? 'Cobrada' : 'Pendiente'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => cambiarEstado(v.id, v.estado === 'cobrada' ? 'pendiente' : 'cobrada')}
                            title="Cambiar estado"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 14, padding: 6, borderRadius: 6 }}
                            onMouseEnter={e => { e.currentTarget.style.color = COLORS.primary; e.currentTarget.style.background = isDark ? 'rgba(13,148,136,0.15)' : '#CCFBF1' }}
                            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = 'none' }}
                          >⇄</button>
                          <button onClick={() => descargarPDF(v)} title="Descargar PDF (sin CAE)"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.primary, fontSize: 14, padding: 6, borderRadius: 6 }}
                          >⬇</button>
                          {arcaActivado && (
                            <button
                              onClick={() => emitirConCAE(v.id)}
                              disabled={emitiendoCAE === v.id}
                              title="Emitir Factura C con CAE oficial de AFIP"
                              style={{
                                background: COLORS.badge.ok.bg,
                                border: `1px solid #86EFAC`,
                                color: COLORS.badge.ok.text,
                                fontSize: 11, fontWeight: 700, padding: '4px 8px',
                                borderRadius: 6, cursor: emitiendoCAE === v.id ? 'wait' : 'pointer',
                                opacity: emitiendoCAE === v.id ? 0.7 : 1,
                              }}
                            >
                              {emitiendoCAE === v.id ? '⏳' : 'CAE'}
                            </button>
                          )}
                          <button onClick={() => { setEmailModal(v.id); setEmailInput('') }} title="Enviar por email"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.secondary, fontSize: 14, padding: 6, borderRadius: 6 }}
                          >✉</button>
                          <button onClick={() => { if (confirm('¿Eliminar esta venta?')) deleteVenta(v.id) }} title="Eliminar"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 18, padding: 6, borderRadius: 6, lineHeight: 1 }}
                            onMouseEnter={e => { e.currentTarget.style.color = COLORS.danger; e.currentTarget.style.background = '#FFF1F2' }}
                            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = 'none' }}
                          >×</button>
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

      {/* Modal nueva venta */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: 500, maxWidth: '100%',
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 20px', fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>
              Registrar venta
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Cliente</p>
                <input value={form.cliente_nombre} onChange={e => setForm(p => ({...p, cliente_nombre: e.target.value}))} placeholder="Nombre del cliente" style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Producto</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={form.producto_id} onChange={e => { const p = productos.find(x => x.id === e.target.value); setForm(f => ({...f, producto_id: e.target.value, precio_unitario: p ? String(p.precio_venta) : f.precio_unitario})) }} style={inp}>
                    <option value="">— Seleccionar —</option>
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}{p.talle ? ` — T: ${p.talle}` : ''}{p.color ? ` · ${p.color}` : ''} (Stock: {p.cantidad})</option>
                    ))}
                  </select>
                  <button onClick={() => setScanner(true)} title="Escanear código"
                    style={{
                      background: '#CCFBF1', border: `1px solid ${COLORS.primary}`,
                      borderRadius: 8, padding: '0 14px', cursor: 'pointer',
                      color: COLORS.primary, fontSize: 18, flexShrink: 0,
                    }}>
                    📷
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Cantidad</p>
                  <input type="number" value={form.cantidad} onChange={e => setForm(p => ({...p, cantidad: e.target.value}))} style={inp} />
                </div>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Precio unitario</p>
                  <input type="number" value={form.precio_unitario} onChange={e => setForm(p => ({...p, precio_unitario: e.target.value}))} style={inp} />
                </div>
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Estado</p>
                <select value={form.estado} onChange={e => setForm(p => ({...p, estado: e.target.value as 'cobrada' | 'pendiente'}))} style={inp}>
                  <option value="cobrada">Cobrada</option>
                  <option value="pendiente">Pendiente</option>
                </select>
              </div>
              {totalVenta > 0 && (
                <div style={{
                  background: COLORS.metric.ventas.bg,
                  border: `1px solid ${COLORS.metric.ventas.border}`,
                  borderRadius: 10, padding: '12px 16px',
                }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.metric.ventas.value }}>
                    Total: {fmt(totalVenta)}
                  </p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={() => setModal(false)} style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '10px 18px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
              }}>Cancelar</button>
              <button onClick={save} style={{
                background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
              }}>Guardar venta</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal email */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: 400, maxWidth: '100%',
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 800, color: t.text }}>Enviar comprobante por email</p>
            <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Email del cliente</p>
            <input value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="cliente@ejemplo.com" style={inp} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEmailModal(null)} style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '10px 18px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
              }}>Cancelar</button>
              <button onClick={() => enviarEmail(emailModal)} disabled={enviando} style={{
                background: COLORS.secondary, color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                opacity: enviando ? 0.7 : 1,
              }}>
                {enviando ? 'Enviando…' : '✉ Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
