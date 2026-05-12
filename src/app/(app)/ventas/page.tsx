'use client'
import { useState, useRef } from 'react'
import { useVentas } from '@/lib/hooks/useVentas'
import { useStock } from '@/lib/hooks/useStock'
import { descargarTicket, TicketData } from '@/lib/ticket'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
import ExportarBtn from '@/components/ExportarBtn'
import { exportarStockExcel, exportarStockPDF, exportarVentasExcel, exportarVentasPDF } from '@/lib/exportar'

// Carga el escáner solo en cliente (usa APIs del browser)
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false })

const fmt = (n: number) => '$' + n.toLocaleString('es-AR')
const fmtK = (n: number) => n >= 1000000 ? '$' + (n/1000000).toFixed(1) + 'M' : n >= 1000 ? '$' + (n/1000).toFixed(0) + 'k' : '$' + n

const inp: React.CSSProperties = {
  background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, padding: '9px 12px', color: '#F0EFF8',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

export default function VentasPage() {
  const { ventas, loading, crearVenta, cambiarEstado, deleteVenta } = useVentas()
  const { productos } = useStock()

  const [modal, setModal]           = useState(false)
  const [scanner, setScanner]       = useState(false)
  const [enviando, setEnviando]     = useState(false)
  const [emailModal, setEmailModal] = useState<string | null>(null) // venta_id
  const [emailInput, setEmailInput] = useState('')
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    cliente_nombre: '', producto_id: '', cantidad: '1',
    precio_unitario: '', estado: 'cobrada' as 'cobrada' | 'pendiente',
  })

  const total = ventas.reduce((a, v) => a + v.total, 0)
  const cobradas = ventas.filter(v => v.estado === 'cobrada').reduce((a, v) => a + v.total, 0)
  const pendienteMonto = ventas.filter(v => v.estado === 'pendiente').reduce((a, v) => a + v.total, 0)
  const productoSel = productos.find(p => p.id === form.producto_id)
  const totalVenta = +form.cantidad * +form.precio_unitario

  // Cuando el escáner detecta un código, busca el producto por SKU
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

  // También permite tipear el código en un input oculto (lector USB)
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
    } catch (e: any) { alert(e.message) }
  }

  // Descarga el ticket en PDF localmente
  const descargarPDF = async (v: any) => {
    const supabase = createClient()
    const orgID = localStorage.getItem('sf_org_id')

    // Obtener datos del negocio desde Supabase
    const { data: org } = await supabase
      .from('organizaciones')
      .select('nombre')
      .eq('id', orgID)
      .single()
      // Castear a any para evitar errores de TypeScript
      const orgData = org as any

    const data: TicketData = {
      nro_factura: v.nro_factura,
      fecha: v.fecha,
      cliente_nombre: v.cliente_nombre ?? 'Consumidor Final',
      negocio_nombre: orgData?.name ?? 'Mi Negocio',
      negocio_cuit: orgData?.cuit,
      negocio_direccion: orgData?.direccion,
      negocio_telefono: orgData?.telefono,
      negocio_email: orgData?.email_negocio,
      negocio_iibb: orgData?.iibb,
      negocio_inicio_actividades: orgData?.inicio_actividades,
      condicion_iva_emisor: orgData?.condicion_iva ?? 'Monotributista',
      condicion_iva_receptor: 'Consumidor Final',
      condicion_venta: 'Contado',
      punto_venta: orgData?.punto_venta ?? '0001',
      tipo_comprobante: 'C',
      items: (v.venta_items ?? []).map((i: any) => ({
        nombre: i.producto_nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal ?? i.cantidad * i.precio_unitario,
      })),
      subtotal: v.subtotal,
      descuento: v.descuento ?? 0,
      total: v.total,
    }
    descargarTicket(data)
  }

  // Envía la factura por email (llama al API route)
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
      if (data.ok) {
        setMsg({ text: 'Email enviado correctamente ✓', ok: true })
      } else {
        setMsg({ text: data.error ?? 'Error al enviar', ok: false })
      }
    } catch {
      setMsg({ text: 'Error de conexión', ok: false })
    }
    setEnviando(false)
    setEmailInput('')
    setEmailModal(null)
    setTimeout(() => setMsg(null), 4000)
  }

  return (
    <div>
      {/* Input oculto para lector de código de barras USB */}
      <input ref={barcodeRef} onKeyDown={handleBarcodeInput}
        style={{ position: 'fixed', opacity: 0, pointerEvents: 'none', top: 0 }} />

      {scanner && <BarcodeScanner onDetected={handleBarcode} onClose={() => setScanner(false)} />}

      {msg && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 3000, background: msg.ok ? 'rgba(34,201,122,0.15)' : 'rgba(224,85,85,0.15)', border: `1px solid ${msg.ok ? '#22C97A' : '#E05555'}`, borderRadius: 10, padding: '12px 20px', color: msg.ok ? '#22C97A' : '#E05555', fontSize: 13, fontWeight: 500 }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Ventas / Facturación</p>
          <p style={{ margin: 0, fontSize: 13, color: '#7A7A95' }}>{ventas.length} operaciones registradas</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setScanner(true)}
            style={{ background: 'rgba(124,111,224,0.15)', color: '#7C6FE0', border: '1px solid rgba(124,111,224,0.4)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            📷 Escanear
          </button>
          <button onClick={() => setModal(true)}
            style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            + Registrar venta
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total facturado', value: fmtK(total), color: '#22C97A' },
          { label: 'Cobrado', value: fmtK(cobradas), color: '#22C97A' },
          { label: 'Por cobrar', value: fmtK(pendienteMonto), color: '#E0A030' },
        ].map(m => (
          <div key={m.label} style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 600, color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? <p style={{ padding: 40, textAlign: 'center', color: '#7A7A95' }}>Cargando...</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Nro.', 'Fecha', 'Cliente', 'Total', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7A7A95', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventas.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#7A7A95', fontSize: 12 }}>{v.nro_factura}</td>
                  <td style={{ padding: '12px 14px', color: '#7A7A95' }}>{v.fecha}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{v.cliente_nombre}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#22C97A' }}>{fmt(v.total)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ background: v.estado === 'cobrada' ? 'rgba(34,201,122,0.12)' : 'rgba(224,160,48,0.12)', color: v.estado === 'cobrada' ? '#22C97A' : '#E0A030', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                      {v.estado === 'cobrada' ? 'Cobrada' : 'Pendiente'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => cambiarEstado(v.id, v.estado === 'cobrada' ? 'pendiente' : 'cobrada')}
                        title="Cambiar estado"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95', fontSize: 14, padding: '2px 6px' }}>⇄</button>
                      <button onClick={() => descargarPDF(v)}
                        title="Descargar PDF"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7C6FE0', fontSize: 14, padding: '2px 6px' }}>⬇</button>
                      <button onClick={() => { setEmailModal(v.id); setEmailInput('') }}
                        title="Enviar por email"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3B8EEA', fontSize: 14, padding: '2px 6px' }}>✉</button>
                      <button onClick={() => deleteVenta(v.id)}
                        title="Eliminar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E05555', fontSize: 16, padding: '2px 6px' }}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nueva venta */}
      <ExportarBtn
        onExcelClick={() => exportarStockExcel(productos, localStorage.getItem('sf_org_name') ?? 'Negocio')}
        onPDFClick={() => exportarStockPDF(productos, localStorage.getItem('sf_org_name') ?? 'Negocio')}
      />
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: 480 }}>
            <p style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600 }}>Registrar venta</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Cliente</p>
                <input value={form.cliente_nombre} onChange={e => setForm(p => ({...p, cliente_nombre: e.target.value}))} placeholder="Nombre del cliente" style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Producto</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={form.producto_id} onChange={e => { const p = productos.find(x => x.id === e.target.value); setForm(f => ({...f, producto_id: e.target.value, precio_unitario: p ? String(p.precio_venta) : f.precio_unitario})) }} style={inp}>
                    <option value="">— Seleccionar —</option>
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}{p.talle ? ` — T: ${p.talle}` : ''}{p.color ? ` · ${p.color}` : ''} (Stock: {p.cantidad})</option>
                    ))}
                  </select>
                  <button onClick={() => setScanner(true)} title="Escanear código"
                    style={{ background: 'rgba(124,111,224,0.15)', border: '1px solid rgba(124,111,224,0.4)', borderRadius: 8, padding: '0 12px', cursor: 'pointer', color: '#7C6FE0', fontSize: 18, flexShrink: 0 }}>
                    📷
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Cantidad</p><input type="number" value={form.cantidad} onChange={e => setForm(p => ({...p, cantidad: e.target.value}))} style={inp} /></div>
                <div><p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Precio unitario</p><input type="number" value={form.precio_unitario} onChange={e => setForm(p => ({...p, precio_unitario: e.target.value}))} style={inp} /></div>
              </div>
              <div><p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Estado</p>
                <select value={form.estado} onChange={e => setForm(p => ({...p, estado: e.target.value as any}))} style={inp}>
                  <option value="cobrada">Cobrada</option>
                  <option value="pendiente">Pendiente</option>
                </select>
              </div>
              {totalVenta > 0 && (
                <div style={{ background: 'rgba(34,201,122,0.12)', border: '1px solid rgba(34,201,122,0.3)', borderRadius: 8, padding: '10px 14px' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#22C97A' }}>Total: {fmt(totalVenta)}</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', color: '#7A7A95', fontSize: 13 }}>Cancelar</button>
              <button onClick={save} style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Guardar venta</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal envío por email */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: 400 }}>
            <p style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>Enviar comprobante por email</p>
            <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Email del cliente</p>
            <input value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="cliente@ejemplo.com" style={inp} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEmailModal(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', color: '#7A7A95', fontSize: 13 }}>Cancelar</button>
              <button onClick={() => enviarEmail(emailModal)} disabled={enviando}
                style={{ background: '#3B8EEA', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: enviando ? 0.7 : 1 }}>
                {enviando ? 'Enviando...' : '✉ Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}