/**
 * Exportacion de reportes a Excel (.xlsx) y PDF.
 *
 * Usa la paleta teal de StockFlow. Los PDFs son reportes resumidos
 * de gestion (NO facturas — eso lo hace ticket.ts).
 */
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Paleta teal — igual que el resto de la app
const TEAL_PRIMARY = [13, 148, 136]   as [number, number, number]   // #0D9488
const TEAL_DARK    = [4, 47, 46]      as [number, number, number]   // #042F2E
const BLANCO       = [255, 255, 255]  as [number, number, number]
const NEGRO        = [28, 69, 66]     as [number, number, number]   // #1C4542
const GRIS_TABLA   = [240, 253, 250]  as [number, number, number]   // #F0FDFA
const HEADER_BG    = [153, 246, 228]  as [number, number, number]   // #99F6E4
const HEADER_TEXT  = [17, 94, 89]     as [number, number, number]   // #115E59

const SUCCESS      = [22, 163, 74]    as [number, number, number]   // #16A34A
const DANGER       = [220, 38, 38]    as [number, number, number]   // #DC2626
const WARNING      = [217, 119, 6]    as [number, number, number]   // #D97706

const fmt = (n: number) => '$' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })
const hoy = () => new Date().toLocaleDateString('es-AR')
const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

// ─── EXCEL ───────────────────────────────────────────────────

type ProductoExport = {
  sku: string
  nombre: string
  talle?: string | null
  color?: string | null
  categoria_nombre?: string | null
  cantidad: number
  stock_minimo: number
  precio_venta: number
  costo: number
  proveedor_nombre?: string | null
}

export function exportarStockExcel(productos: ProductoExport[], negocio: string) {
  const datos = productos.map(p => ({
    'SKU':           p.sku,
    'Nombre':        p.nombre,
    'Talle':         p.talle ?? '',
    'Color':         p.color ?? '',
    'Categoría':     p.categoria_nombre ?? '',
    'Cantidad':      p.cantidad,
    'Stock Mínimo':  p.stock_minimo,
    'Precio Venta':  p.precio_venta,
    'Costo':         p.costo,
    'Margen %':      p.precio_venta > 0 ? Math.round(((p.precio_venta - p.costo) / p.precio_venta) * 100) : 0,
    'Estado':        p.cantidad <= p.stock_minimo ? 'Stock Bajo' : 'OK',
    'Proveedor':     p.proveedor_nombre ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(datos)
  ws['!cols'] = [
    { wch: 12 }, { wch: 35 }, { wch: 10 }, { wch: 12 }, { wch: 15 },
    { wch: 10 }, { wch: 13 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
    { wch: 12 }, { wch: 20 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSX.writeFile(wb, `${slug(negocio)}-inventario-${hoy().replace(/\//g, '-')}.xlsx`)
}

type VentaExport = {
  nro_factura: string
  fecha: string
  cliente_nombre?: string | null
  total: number
  estado: 'cobrada' | 'pendiente' | 'cancelada'
}

export function exportarVentasExcel(ventas: VentaExport[], negocio: string) {
  const datos = ventas.map(v => ({
    'Nro. Factura': v.nro_factura,
    'Fecha':        v.fecha,
    'Cliente':      v.cliente_nombre ?? 'Consumidor Final',
    'Total':        v.total,
    'Estado':       v.estado === 'cobrada' ? 'Cobrada' : v.estado === 'pendiente' ? 'Pendiente' : 'Cancelada',
  }))

  const totales = {
    'Nro. Factura': 'TOTAL',
    'Fecha': '',
    'Cliente': '',
    'Total': ventas.reduce((a, v) => a + v.total, 0),
    'Estado': '',
  }

  const ws = XLSX.utils.json_to_sheet([...datos, totales])
  ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 12 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas')
  XLSX.writeFile(wb, `${slug(negocio)}-ventas-${hoy().replace(/\//g, '-')}.xlsx`)
}

type MovimientoExport = {
  fecha: string
  descripcion: string
  categoria_nombre?: string | null
  tipo: 'ingreso' | 'egreso'
  monto: number
}

export function exportarFinanzasExcel(movimientos: MovimientoExport[], negocio: string) {
  const datos = movimientos.map(m => ({
    'Fecha':       m.fecha,
    'Descripción': m.descripcion,
    'Categoría':   m.categoria_nombre ?? '',
    'Tipo':        m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
    'Monto':       m.tipo === 'ingreso' ? m.monto : -m.monto,
  }))

  const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0)
  const egresos  = movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0)

  const resumen = [
    { 'Fecha': '', 'Descripción': 'TOTAL INGRESOS', 'Categoría': '', 'Tipo': 'Ingreso', 'Monto': ingresos },
    { 'Fecha': '', 'Descripción': 'TOTAL EGRESOS',  'Categoría': '', 'Tipo': 'Egreso',  'Monto': -egresos },
    { 'Fecha': '', 'Descripción': 'SALDO NETO',     'Categoría': '', 'Tipo': '',        'Monto': ingresos - egresos },
  ]

  const ws = XLSX.utils.json_to_sheet([...datos, ...resumen])
  ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 15 }, { wch: 10 }, { wch: 14 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Finanzas')
  XLSX.writeFile(wb, `${slug(negocio)}-finanzas-${hoy().replace(/\//g, '-')}.xlsx`)
}

// ─── PDF REPORTES ─────────────────────────────────────────────

function headerPDF(doc: jsPDF, titulo: string, negocio: string) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...TEAL_DARK)
  doc.rect(0, 0, W, 32, 'F')

  doc.setTextColor(...BLANCO)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('StockFlow', 15, 13)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(94, 234, 212)
  doc.text(negocio, 15, 22)

  doc.setTextColor(...BLANCO)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, W / 2, 14, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(94, 234, 212)
  doc.text(`Generado: ${hoy()}`, W - 15, 22, { align: 'right' })
}

function footerPDF(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setFillColor(...TEAL_DARK)
  doc.rect(0, H - 12, W, 12, 'F')
  doc.setTextColor(94, 234, 212)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Generado por StockFlow — Gestión PyME', W / 2, H - 4, { align: 'center' })
}

export function exportarStockPDF(productos: ProductoExport[], negocio: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  headerPDF(doc, 'Reporte de Inventario', negocio)

  const stockBajo = productos.filter(p => p.cantidad <= p.stock_minimo).length
  const valorTotal = productos.reduce((a, p) => a + p.cantidad * p.costo, 0)

  doc.setFontSize(10)
  doc.setTextColor(...NEGRO)
  doc.setFont('helvetica', 'normal')
  const metricas = [
    `Total productos: ${productos.length}`,
    `Stock bajo: ${stockBajo}`,
    `Valor inventario: ${fmt(valorTotal)}`,
  ]
  metricas.forEach((m, i) => doc.text(m, 15 + i * 90, 42))

  autoTable(doc, {
    startY: 48,
    head: [['SKU', 'Nombre', 'Talle', 'Color', 'Cant.', 'Mín.', 'P. Venta', 'Costo', 'Margen', 'Estado']],
    body: productos.map(p => {
      const margen = p.precio_venta > 0 ? Math.round(((p.precio_venta - p.costo) / p.precio_venta) * 100) : 0
      const bajo = p.cantidad <= p.stock_minimo
      return [p.sku, p.nombre, p.talle ?? '—', p.color ?? '—', p.cantidad, p.stock_minimo, fmt(p.precio_venta), fmt(p.costo), `${margen}%`, bajo ? 'Bajo' : 'OK']
    }),
    headStyles: { fillColor: HEADER_BG, textColor: HEADER_TEXT, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: NEGRO },
    alternateRowStyles: { fillColor: GRIS_TABLA },
    didParseCell: (cell) => {
      if (cell.column.index === 9 && cell.section === 'body') {
        const val = String(cell.cell.raw)
        cell.cell.styles.textColor = val === 'Bajo' ? DANGER : SUCCESS
        cell.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 10, right: 10 },
  })

  footerPDF(doc)
  doc.save(`${slug(negocio)}-inventario-${hoy().replace(/\//g, '-')}.pdf`)
}

export function exportarVentasPDF(ventas: VentaExport[], negocio: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  headerPDF(doc, 'Reporte de Ventas', negocio)

  const total = ventas.reduce((a, v) => a + v.total, 0)
  const cobradas = ventas.filter(v => v.estado === 'cobrada').reduce((a, v) => a + v.total, 0)
  const pendiente = ventas.filter(v => v.estado === 'pendiente').reduce((a, v) => a + v.total, 0)

  doc.setFontSize(10)
  doc.setTextColor(...NEGRO)
  doc.text(`Total: ${fmt(total)}   ·   Cobrado: ${fmt(cobradas)}   ·   Pendiente: ${fmt(pendiente)}`, 15, 42)

  autoTable(doc, {
    startY: 48,
    head: [['Nro.', 'Fecha', 'Cliente', 'Total', 'Estado']],
    body: ventas.map(v => [
      v.nro_factura,
      v.fecha,
      v.cliente_nombre ?? 'Consumidor Final',
      fmt(v.total),
      v.estado === 'cobrada' ? 'Cobrada' : v.estado === 'pendiente' ? 'Pendiente' : 'Cancelada',
    ]),
    headStyles: { fillColor: HEADER_BG, textColor: HEADER_TEXT, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: NEGRO },
    alternateRowStyles: { fillColor: GRIS_TABLA },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'center' } },
    didParseCell: (cell) => {
      if (cell.column.index === 4 && cell.section === 'body') {
        const v = String(cell.cell.raw)
        cell.cell.styles.textColor = v === 'Cobrada' ? SUCCESS : v === 'Pendiente' ? WARNING : DANGER
        cell.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 15, right: 15 },
  })

  footerPDF(doc)
  doc.save(`${slug(negocio)}-ventas-${hoy().replace(/\//g, '-')}.pdf`)
}

export function exportarFinanzasPDF(movimientos: MovimientoExport[], negocio: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  headerPDF(doc, 'Reporte Financiero', negocio)

  const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0)
  const egresos  = movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0)
  const saldo    = ingresos - egresos

  doc.setFontSize(10)
  doc.setTextColor(...NEGRO)
  doc.text(`Ingresos: ${fmt(ingresos)}   ·   Egresos: ${fmt(egresos)}   ·   Saldo: ${fmt(saldo)}`, 15, 42)

  autoTable(doc, {
    startY: 48,
    head: [['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Monto']],
    body: movimientos.map(m => [
      m.fecha,
      m.descripcion,
      m.categoria_nombre ?? '',
      m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      (m.tipo === 'ingreso' ? '+' : '−') + fmt(m.monto),
    ]),
    headStyles: { fillColor: HEADER_BG, textColor: HEADER_TEXT, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: NEGRO },
    alternateRowStyles: { fillColor: GRIS_TABLA },
    columnStyles: { 4: { halign: 'right' } },
    didParseCell: (cell) => {
      if (cell.column.index === 3 && cell.section === 'body') {
        const v = String(cell.cell.raw)
        cell.cell.styles.textColor = v === 'Ingreso' ? SUCCESS : DANGER
        cell.cell.styles.fontStyle = 'bold'
      }
      if (cell.column.index === 4 && cell.section === 'body') {
        const v = String(cell.cell.raw)
        if (v.startsWith('+')) cell.cell.styles.textColor = SUCCESS
        if (v.startsWith('−')) cell.cell.styles.textColor = DANGER
        cell.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 15, right: 15 },
  })

  // Resumen total destacado
  type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } }
  const finalY = ((doc as AutoTableDoc).lastAutoTable?.finalY ?? 200) + 8
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEAL_PRIMARY)
  doc.text(`Saldo neto: ${fmt(saldo)}`, doc.internal.pageSize.getWidth() - 15, finalY, { align: 'right' })

  footerPDF(doc)
  doc.save(`${slug(negocio)}-finanzas-${hoy().replace(/\//g, '-')}.pdf`)
}
