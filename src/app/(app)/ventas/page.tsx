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
import { usePermiso } from '@/lib/auth/usePermiso'

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false })

const fmt = (n: number) => '$' + n.toLocaleString('es-AR')

/**
 * Como paga el cliente. 'cuotas' no es un medio de pago sino lo contrario —
 * la venta NO se cobra ahora — pero en el mostrador se elige en el mismo
 * momento y con la misma pregunta, asi que va en la misma lista.
 */
const METODOS_PAGO = [
  { id: 'efectivo',      label: 'Efectivo',       icon: '\u{1F4B5}' },
  { id: 'debito',        label: 'D\u00e9bito',         icon: '\u{1F4B3}' },
  { id: 'credito',       label: 'Cr\u00e9dito',        icon: '\u{1F4B3}' },
  { id: 'transferencia', label: 'Transferencia',  icon: '\u{1F3E6}' },
  { id: 'mercadopago',   label: 'Mercado Pago',   icon: '\u{1F4F1}' },
  { id: 'cuotas',        label: 'Queda a cobrar', icon: '\u{1F553}' },
] as const

type MetodoPago = typeof METODOS_PAGO[number]['id']

const METODO_LABEL: Record<string, string> =
  Object.fromEntries(METODOS_PAGO.map(m => [m.id, m.label]))
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
  metodo_pago?: string | null
  venta_items?: VentaItem[]
}

export default function VentasPage() {
  const { ventas, loading, crearVenta, cambiarEstado, anularVenta } = useVentas()
  const { productos } = useStock()
  // Tres permisos distintos a proposito. Eliminar va separado de crear porque
  // es el control clasico contra el faltante: quien registra la venta en el
  // mostrador no deberia poder borrarla despues (el preset 'vendedor' tiene
  // crear_ventas y editar_ventas, pero NO eliminar_ventas).
  const puedeCrear    = usePermiso('crear_ventas')
  const puedeEditar   = usePermiso('editar_ventas')
  const puedeEliminar = usePermiso('eliminar_ventas')

  const [modal, setModal]           = useState(false)
  const [scanner, setScanner]       = useState(false)
  const [enviando, setEnviando]     = useState(false)
  const [emailModal, setEmailModal] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null)
  const [guardando, setGuardando]   = useState(false)
  // Cobro por QR de Mercado Pago. El estado de la venta NO se guarda aca: se
  // lee de `ventas`, que se actualiza sola por Realtime cuando el webhook la
  // marca cobrada. Asi el modal refleja la verdad sin hacer polling.
  const [qrCobro, setQrCobro] = useState<{ id: string; nro: string; total: number; link: string } | null>(null)
  const [generandoQR, setGenerandoQR] = useState(false)
  const barcodeRef = useRef<HTMLInputElement>(null)
  // Guarda de reentrada por REF, no por estado: setGuardando(true) no surte
  // efecto hasta el proximo render, asi que dos clics en el mismo tick se
  // colaban igual. Con el ref el segundo se corta en seco.
  const guardandoRef = useRef(false)

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('stk_dark_mode') === '1')
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

  // Cliente de Supabase para el plan de cuotas (la venta va por la RPC).
  const supabase = useMemo(() => createClient(), [])

  const [form, setForm] = useState({
    cliente_nombre: '', producto_id: '', cantidad: '1',
    precio_unitario: '', metodo_pago: 'efectivo' as MetodoPago,
    // Solo se usan cuando el medio es 'cuotas'
    cantidad_cuotas: '3', interes_pct: '0', frecuencia: 'mensual',
  })

  // El estado se deriva del medio. Dos casos nacen PENDIENTES:
  //  - 'cuotas'      -> la venta no se cobra ahora
  //  - 'mercadopago' -> se cobra cuando MP confirme; si naciera cobrada no
  //                     habria nada que confirmar y el QR seria decorativo
  const quedaACobrar = form.metodo_pago === 'cuotas'
  const cobraPorMP = form.metodo_pago === 'mercadopago'
  const estadoDerivado: 'cobrada' | 'pendiente' =
    quedaACobrar || cobraPorMP ? 'pendiente' : 'cobrada'

  // Las anuladas no suman en ningun total: la operacion se deshizo.
  const vigentes = ventas.filter(v => v.estado !== 'cancelada')
  const total = vigentes.reduce((a, v) => a + v.total, 0)
  const cobradas = vigentes.filter(v => v.estado === 'cobrada').reduce((a, v) => a + v.total, 0)
  const pendienteMonto = vigentes.filter(v => v.estado === 'pendiente').reduce((a, v) => a + v.total, 0)
  // La verdad sobre si ya pagaron sale de `ventas`, no de un estado local:
  // cuando el webhook marca la venta cobrada, Realtime refresca la lista y
  // este valor cambia solo. Sin polling.
  const ventaDelQR = qrCobro ? ventas.find(v => v.id === qrCobro.id) : undefined
  const qrPagado = ventaDelQR?.estado === 'cobrada'

  const productoSel = productos.find(p => p.id === form.producto_id)
  const totalVenta = +form.cantidad * +form.precio_unitario

  // Misma formula que la pantalla de Cuotas, para que un plan creado desde
  // aca y uno creado alla den exactamente lo mismo.
  const totalConInteres = +form.interes_pct
    ? totalVenta * (1 + +form.interes_pct / 100)
    : totalVenta
  const montoPorCuota = +form.cantidad_cuotas
    ? totalConInteres / +form.cantidad_cuotas
    : 0

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

  // Sin esta guarda, dos clics seguidos creaban DOS ventas: save() es async,
  // el boton no se deshabilitaba y cada clic disparaba su propia llamada a
  // crear_venta_segura. Paso en produccion (dos filas a 98 ms de distancia).
  const save = async () => {
    if (!form.cliente_nombre || !form.producto_id) return
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const creada = await crearVenta({
        cliente_nombre: form.cliente_nombre,
        fecha: new Date().toISOString().split('T')[0],
        estado: estadoDerivado,
        metodo_pago: quedaACobrar ? null : form.metodo_pago,
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
      // Plan de cuotas vinculado a ESTA venta.
      //
      // La pantalla de Cuotas crea su propia venta con numero CTA-<uuid>.
      // Aca no: la venta ya existe, con su numero correlativo FC- y el stock
      // descontado. Crear otra duplicaria la operacion y descuadraria el
      // inventario, asi que el plan se engancha a la venta por venta_id.
      if (quedaACobrar && creada?.id) {
        const orgId = localStorage.getItem('stk_org_id')
        const { error: errPlan } = await supabase.from('cuotas_ventas').insert({
          org_id: orgId,
          venta_id: creada.id,
          cliente_nombre: form.cliente_nombre,
          monto_total: totalConInteres,
          monto_cuota: montoPorCuota,
          cantidad_cuotas: +form.cantidad_cuotas,
          interes_pct: +form.interes_pct,
          frecuencia: form.frecuencia,
          fecha_inicio: new Date().toISOString().split('T')[0],
        })
        // La venta ya quedo registrada: si falla el plan hay que decirlo, no
        // dejar al usuario creyendo que armo un plan de pagos que no existe.
        if (errPlan) {
          setMsg({
            text: `La venta se registró, pero no se pudo crear el plan de cuotas: ${errPlan.message}. Armalo desde Cuotas.`,
            ok: false,
          })
          setTimeout(() => setMsg(null), 8000)
        } else {
          setMsg({
            text: `Venta registrada · plan de ${form.cantidad_cuotas} cuotas de ${fmt(montoPorCuota)}`,
            ok: true,
          })
          setTimeout(() => setMsg(null), 6000)
        }
      }

      setForm({
        cliente_nombre: '', producto_id: '', cantidad: '1', precio_unitario: '',
        metodo_pago: 'efectivo', cantidad_cuotas: '3', interes_pct: '0', frecuencia: 'mensual',
      })
      setModal(false)
      // Con Mercado Pago el flujo no termina al guardar: falta que el cliente
      // escanee y pague. Se abre el QR con la venta ya creada.
      if (cobraPorMP && creada?.id) {
        await abrirCobroQR({ id: creada.id, nro_factura: creada.nro_factura, total: creada.total })
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  // Genera el link de pago de MP para una venta y abre el QR. Sirve tanto
  // recien creada la venta como despues, desde la fila, si quedo pendiente.
  const abrirCobroQR = async (v: { id: string; nro_factura: string; total: number }) => {
    setGenerandoQR(true)
    try {
      const res = await fetch('/api/mp/cobro-venta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venta_id: v.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setMsg({ text: data?.error ?? 'No se pudo generar el cobro', ok: false })
        setTimeout(() => setMsg(null), 6000)
        return
      }
      setQrCobro({ id: v.id, nro: v.nro_factura, total: v.total, link: data.link })
    } catch {
      setMsg({ text: 'Error de conexión con Mercado Pago', ok: false })
      setTimeout(() => setMsg(null), 6000)
    } finally {
      setGenerandoQR(false)
    }
  }

  // Respaldo manual: si el webhook tarda o el cliente pago por otra via, el
  // vendedor no puede quedar esperando a una confirmacion que no llega.
  const marcarCobradaAMano = async (id: string) => {
    try {
      await cambiarEstado(id, 'cobrada')
      setMsg({ text: 'Venta marcada como cobrada', ok: true })
      setQrCobro(null)
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo marcar cobrada', ok: false })
    }
    setTimeout(() => setMsg(null), 5000)
  }

  // Anular en vez de borrar: la venta queda registrada como anulada, el stock
  // vuelve al inventario y la plata sale de la caja. Borrarla dejaria un hueco
  // en la numeracion correlativa que ARCA exige.
  const anular = async (v: VentaRow) => {
    const ok = confirm(
      `¿Anular la venta ${v.nro_factura}?

` +
      `· El stock vuelve al inventario
` +
      `· Se descuenta $${v.total.toLocaleString('es-AR')} de la caja
` +
      `· La venta queda registrada como anulada, no se borra`
    )
    if (!ok) return
    try {
      const res = await anularVenta(v.id)
      setMsg({
        text: res?.ya_estaba ? 'Esa venta ya estaba anulada' : `Venta ${v.nro_factura} anulada`,
        ok: true,
      })
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo anular', ok: false })
    }
    setTimeout(() => setMsg(null), 6000)
  }

  const descargarPDF = async (v: VentaRow) => {
    const supabase = createClient()
    const orgID = localStorage.getItem('stk_org_id')

    const { data: org } = await supabase
      // Vista sin secretos: la factura solo necesita los datos fiscales.
      .from('mi_organizacion')
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
      negocio_nombre: (orgData.name as string) ?? 'Mi Negocio',
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
            onExcelClick={() => exportarVentasExcel(ventas, localStorage.getItem('stk_org_nombre') ?? 'Negocio')}
            onPDFClick={() => exportarVentasPDF(ventas, localStorage.getItem('stk_org_nombre') ?? 'Negocio')}
          />
          {/* Escanear abre directo el alta de venta, asi que va con el mismo
              permiso que el boton de registrar. */}
          {puedeCrear && (
            <button onClick={() => setScanner(true)} style={{
              background: '#CCFBF1', color: COLORS.primary,
              border: `1px solid ${COLORS.primary}`, borderRadius: 8,
              padding: '10px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            }}>
              📷 Escanear
            </button>
          )}
          {puedeCrear && (
            <button onClick={() => setModal(true)} style={{
              background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
            }}>
              + Registrar venta
            </button>
          )}
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
            {/* Sin permiso no hay boton al que mandarlo: el texto lo mandaba a
                buscar algo que no ve. */}
            {puedeCrear
              ? <>Sin ventas registradas. Empezá con &quot;+ Registrar venta&quot;.</>
              : <>Todavía no hay ventas registradas.</>}
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
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: t.text }}>
                        {v.cliente_nombre}
                        {/* Guardar el medio y no mostrarlo seria guardarlo para nada. */}
                        {v.metodo_pago && (
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: t.textMuted, marginTop: 2 }}>
                            {METODO_LABEL[v.metodo_pago] ?? v.metodo_pago}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: COLORS.success }}>{fmt(v.total)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          background: v.estado === 'cancelada' ? COLORS.badge.error.bg
                            : v.estado === 'cobrada' ? COLORS.badge.cobrada.bg : COLORS.badge.pendiente.bg,
                          color: v.estado === 'cancelada' ? COLORS.badge.error.text
                            : v.estado === 'cobrada' ? COLORS.badge.cobrada.text : COLORS.badge.pendiente.text,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          display: 'inline-block',
                        }}>
                          {v.estado === 'cancelada' ? 'Anulada' : v.estado === 'cobrada' ? 'Cobrada' : 'Pendiente'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {puedeEditar && v.estado !== 'cancelada' && (
                          <button onClick={() => cambiarEstado(v.id, v.estado === 'cobrada' ? 'pendiente' : 'cobrada')}
                            title="Cambiar estado"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 14, padding: 6, borderRadius: 6 }}
                            onMouseEnter={e => { e.currentTarget.style.color = COLORS.primary; e.currentTarget.style.background = isDark ? 'rgba(13,148,136,0.15)' : '#CCFBF1' }}
                            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = 'none' }}
                          >⇄</button>
                          )}
                          <button onClick={() => descargarPDF(v)} title="Descargar PDF (sin CAE)"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.primary, fontSize: 14, padding: 6, borderRadius: 6 }}
                          >⬇</button>
                          {/* Emitir CAE genera una factura oficial ante AFIP:
                              es un acto fiscal, no una descarga. Va gateado. */}
                          {arcaActivado && puedeEditar && (
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
                          {puedeEditar && v.estado === 'pendiente' && (
                          <button onClick={() => abrirCobroQR(v)} disabled={generandoQR} title="Cobrar con QR de Mercado Pago"
                            style={{ background: 'none', border: 'none', cursor: generandoQR ? 'wait' : 'pointer', color: COLORS.primary, fontSize: 14, padding: 6, borderRadius: 6 }}
                          >📱</button>
                          )}
                          {puedeEliminar && v.estado !== 'cancelada' && (
                          <button onClick={() => anular(v)} title="Anular venta"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 16, padding: 6, borderRadius: 6, lineHeight: 1 }}
                            onMouseEnter={e => { e.currentTarget.style.color = COLORS.danger; e.currentTarget.style.background = '#FFF1F2' }}
                            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = 'none' }}
                          >⊘</button>
                          )}
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

      {/* Cobro por QR de Mercado Pago */}
      {qrCobro && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: 380, maxWidth: '100%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: t.text }}>
              Cobrar venta {qrCobro.nro}
            </p>
            <p style={{ margin: '0 0 18px', fontSize: 20, fontWeight: 800, color: COLORS.success }}>
              {fmt(qrCobro.total)}
            </p>

            {qrPagado ? (
              <div style={{
                background: COLORS.badge.ok.bg, border: '1px solid #86EFAC',
                borderRadius: 12, padding: '28px 16px', marginBottom: 18,
              }}>
                <p style={{ fontSize: 40, margin: '0 0 8px' }}>✅</p>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.badge.ok.text }}>
                  ¡Pago confirmado!
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: COLORS.badge.ok.text }}>
                  Mercado Pago acreditó el cobro y la venta quedó cobrada.
                </p>
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`QR para pagar la venta ${qrCobro.nro}`}
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrCobro.link)}&margin=16`}
                  style={{ width: 220, height: 220, borderRadius: 12, background: '#fff' }}
                />
                <p style={{ margin: '14px 0 0', fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
                  Que el cliente escanee el código con Mercado Pago.
                  <br />
                  Cuando pague, esta pantalla se actualiza sola.
                </p>
              </>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
              {!qrPagado && (
                <>
                  <button onClick={() => navigator.clipboard.writeText(qrCobro.link).then(() => setMsg({ text: 'Link copiado', ok: true }))} style={{
                    background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8,
                    padding: '10px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
                  }}>
                    Copiar link de pago
                  </button>
                  {/* Respaldo manual: si el webhook tarda o el cliente pago por
                      otra via, el vendedor no queda esperando algo que no llega. */}
                  <button onClick={() => marcarCobradaAMano(qrCobro.id)} style={{
                    background: 'transparent', border: `1px solid ${COLORS.primary}`, borderRadius: 8,
                    padding: '10px', cursor: 'pointer', color: COLORS.primary, fontSize: 13, fontWeight: 700,
                  }}>
                    Ya me pagó — marcar cobrada
                  </button>
                </>
              )}
              <button onClick={() => setQrCobro(null)} style={{
                background: qrPagado ? COLORS.primary : 'none',
                color: qrPagado ? '#fff' : t.textMuted,
                border: qrPagado ? 'none' : `1px solid ${t.border}`,
                borderRadius: 8, padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
                {qrPagado ? 'Listo' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <p style={{ margin: '0 0 8px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>¿Cómo paga?</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {METODOS_PAGO.map(m => {
                    const activo = form.metodo_pago === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setForm(p => ({ ...p, metodo_pago: m.id }))}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          background: activo ? COLORS.primary : 'transparent',
                          color: activo ? '#fff' : t.textMuted,
                          border: `1px solid ${activo ? COLORS.primary : t.border}`,
                          borderRadius: 8, padding: '10px 6px', cursor: 'pointer',
                          fontSize: 12, fontWeight: activo ? 700 : 500,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{m.icon}</span>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
                {quedaACobrar && (
                  <div style={{
                    marginTop: 12,
                    background: isDark ? 'rgba(94,234,212,0.06)' : '#F0FDFA',
                    border: `1px solid ${t.borderCard}`, borderRadius: 10, padding: 14,
                  }}>
                    <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Plan de pago
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Cuotas</p>
                        <input type="number" min="2" value={form.cantidad_cuotas}
                          onChange={e => setForm(p => ({ ...p, cantidad_cuotas: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Interés %</p>
                        <input type="number" min="0" value={form.interes_pct}
                          onChange={e => setForm(p => ({ ...p, interes_pct: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Frecuencia</p>
                        <select value={form.frecuencia}
                          onChange={e => setForm(p => ({ ...p, frecuencia: e.target.value }))} style={inp}>
                          <option value="semanal">Semanal</option>
                          <option value="quincenal">Quincenal</option>
                          <option value="mensual">Mensual</option>
                        </select>
                      </div>
                    </div>
                    {totalVenta > 0 && +form.cantidad_cuotas > 0 && (
                      <p style={{ margin: '12px 0 0', fontSize: 13, color: t.text, lineHeight: 1.5 }}>
                        <strong>{form.cantidad_cuotas} cuotas de {fmt(Math.round(montoPorCuota))}</strong>
                        {totalConInteres !== totalVenta && (
                          <span style={{ color: t.textMuted }}> · total {fmt(Math.round(totalConInteres))} con interés</span>
                        )}
                      </p>
                    )}
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>
                      La venta queda <strong>pendiente</strong> y el plan aparece en Cuotas para ir cobrándolo.
                    </p>
                  </div>
                )}
                {cobraPorMP && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>
                    Al guardar se muestra el <strong>QR</strong> para que el cliente escanee.
                    La venta se marca cobrada cuando Mercado Pago confirme.
                  </p>
                )}
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
              <button onClick={save} disabled={guardando} style={{
                background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 22px', cursor: guardando ? 'wait' : 'pointer',
                fontWeight: 700, fontSize: 13, opacity: guardando ? 0.7 : 1,
                boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
              }}>{guardando ? 'Guardando…' : 'Guardar venta'}</button>
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
