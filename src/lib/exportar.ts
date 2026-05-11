// ============================================================
//  STOCKFLOW — Exportación a Excel y PDF
//  Instalá: npm install xlsx
//  jsPDF ya está instalado
// ============================================================

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const MORADO = [124, 111, 224] as [number, number, number]
const BLANCO = [255, 255, 255] as [number, number, number]
const NEGRO  = [30, 30, 30]   as [number, number, number]
const GRIS   = [245, 245, 250] as [number, number, number]

const fmt = (n: number) => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2 })
const hoy  = () => new Date().toLocaleDateString('es-AR')

// ─── EXCEL ───────────────────────────────────────────────────

export function exportarStockExcel(productos: any[], negocio: string) {
  const datos = productos.map(p => ({
    'SKU':            p.sku,
    'Nombre':         p.nombre,
    'Categoría':      p.categoria_nombre ?? '',
    'Cantidad':       p.cantidad,
    'Stock Mínimo':   p.stock_minimo,
    'Precio Venta':   p.precio_venta,
    'Costo':          p.costo,
    'Margen %':       p.precio_venta > 0 ? Math.round(((p.precio_venta - p.costo) / p.precio_venta) * 100) : 0,
    'Estado':         p.cantidad <= p.stock_minimo ? 'Stock Bajo' : 'OK',
    'Proveedor':      p.proveedor_nombre ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(datos)

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 10 },
    { wch: 13 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
    { wch: 12 }, { wch: 20 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSX.writeFile(wb, `${negocio}-inventario-${hoy().replace(/\//g, '-')}.xlsx`)
}

export function exportarVentasExcel(ventas: any[], negocio: string) {
  const datos = ventas.map(v => ({
    'Nro. Factura':   v.nro_factura,
    'Fecha':          v.fecha,
    'Cliente':        v.cliente_nombre ?? 'Consumidor Final',
    'Total':          v.total,
    'Estado':         v.estado === 'cobrada' ? 'Cobrada' : v.estado === 'pendiente' ? 'Pendiente' : 'Cancelada',
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
  XLSX.writeFile(wb, `${negocio}-ventas-${hoy().replace(/\//g, '-')}.xlsx`)
}

export function exportarFinanzasExcel(movimientos: any[], negocio: string) {
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
  XLSX.writeFile(wb, `${negocio}-finanzas-${hoy().replace(/\//g, '-')}.xlsx`)
}

// ─── PDF REPORTES ─────────────────────────────────────────────

function headerPDF(doc: jsPDF, titulo: string, negocio: string) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...MORADO)
  doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(...BLANCO)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('StockFlow', 15, 13)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(negocio, 15, 21)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, W / 2, 13, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generado: ${hoy()}`, W - 15, 21, { align: 'right' })
}

function footerPDF(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setFillColor(...MORADO)
  doc.rect(0, H - 12, W, 12, 'F')
  doc.setTextColor(...BLANCO)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Generado por StockFlow — Software de Gestión PyME', W / 2, H - 4, { align: 'center' })
}

export function exportarStockPDF(productos: any[], negocio: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  headerPDF(doc, 'Reporte de Inventario', negocio)

  const stockBajo = productos.filter(p => p.cantidad <= p.stock_minimo).length
  const valorTotal = productos.reduce((a, p) => a + p.cantidad * p.costo, 0)

  // Métricas
  doc.setFontSize(10)
  doc.setTextColor(...NEGRO)
  doc.setFont('helvetica', 'normal')
  const metricas = [
    `Total productos: ${productos.length}`,
    `Stock bajo: ${stockBajo}`,
    `Valor inventario: ${fmt(valorTotal)}`,
  ]
  metricas.forEach((m, i) => doc.text(m, 15 + i * 90, 40))

  autoTable(doc, {
    startY: 46,
    head: [['SKU', 'Nombre', 'Cantidad', 'Mínimo', 'Precio Venta', 'Costo', 'Margen', 'Estado']],
    body: productos.map(p => {
      const margen = p.precio_venta > 0 ? Math.round(((p.precio_venta - p.costo) / p.precio_venta) * 100) : 0
      const bajo = p.cantidad <= p.stock_minimo
      return [p.sku, p.nombre, p.cantidad, p.stock_minimo, fmt(p.precio_venta), fmt(p.costo), `${margen}%`, bajo ? '⚠ Bajo' : '✓ OK']
    }),
    headStyles: { fillColor: MORADO, textColor: BLANCO, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: NEGRO },
    alternateRowStyles: { fillColor: GRIS },
    didParseCell: (data) => {
      if (data.column.index === 7 && data.section === 'body') {
        const val = String(data.cell.raw)
        data.cell.styles.textColor = val.includes('Bajo') ? [200, 50, 50] : [22, 160, 101]
        data.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 15, right: 15 },
  })

  footerPDF(doc)
  doc.save(`${negocio}-inventario-${hoy().replace(/\//g, '-')}.pdf`)
}

export function exportarVentasPDF(ventas: any[], negocio: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  headerPDF(doc, 'Reporte de Ventas', negocio)

  const total = ventas.reduce((a, v) => a + v.total, 0)
  const cobradas = ventas.filter(v => v.estado === 'cobrada').reduce((a, v) => a + v.total, 0)
  const pendiente = ventas.filter(v => v.estado === 'pendiente').reduce((a, v) => a + v.total, 0)

  doc.setFontSize(10)
  doc.setTextColor(...NEGRO)
  doc.text(`Total: ${fmt(total)}   Cobrado: ${fmt(cobradas)}   Pendiente: ${fmt(pendiente)}`, 15, 40)

  autoTable(doc, {
    startY: 46,
    head: [['Nro.', 'Fecha', 'Cliente', 'Total', 'Estado']],
    body: ventas.map(v => [
      v.nro_factura,
      v.fecha,
      v.cliente_nombre ?? 'Consumidor Final',
      fmt(v.total),
      v.estado === 'cobrada' ? 'Cobrada' : 'Pendiente',
    ]),
    headStyles: { fillColor: MORADO, textColor: BLANCO, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: NEGRO },
    alternateRowStyles: { fillColor: GRIS },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'center' } },
    didParseCell: (data) => {
      if (data.column.index === 4 && data.section === 'body') {
        data.cell.styles.textColor = String(data.cell.raw) === 'Cobrada' ? [22, 160, 101] : [200, 120, 0]
        data.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 15, right: 15 },
  })

  footerPDF(doc)
  doc.save(`${negocio}-ventas-${hoy().replace(/\//g, '-')}.pdf`)
}

export function exportarFinanzasPDF(movimientos: any[], negocio: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  headerPDF(doc, 'Reporte Financiero', negocio)

  const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0)
  const egresos  = movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0)
  const saldo    = ingresos - egresos

  doc.setFontSize(10)
  doc.setTextColor(...NEGRO)
  doc.text(`Ingresos: ${fmt(ingresos)}   Egresos: ${fmt(egresos)}   Saldo: ${fmt(saldo)}`, 15, 40)

  autoTable(doc, {
    startY: 46,
    head: [['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Monto']],
    body: movimientos.map(m => [
      m.fecha,
      m.descripcion,
      m.categoria_nombre ?? '',
      m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      fmt(m.monto),
    ]),
    headStyles: { fillColor: MORADO, textColor: BLANCO, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: NEGRO },
    alternateRowStyles: { fillColor: GRIS },
    columnStyles: { 4: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.column.index === 3 && data.section === 'body') {
        data.cell.styles.textColor = String(data.cell.raw) === 'Ingreso' ? [22, 160, 101] : [200, 50, 50]
        data.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 15, right: 15 },
  })

  footerPDF(doc)
  doc.save(`${negocio}-finanzas-${hoy().replace(/\//g, '-')}.pdf`)
}