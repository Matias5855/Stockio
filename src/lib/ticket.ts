import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface TicketData {
  nro_factura: string
  fecha: string
  cliente_nombre: string
  negocio_nombre: string
  negocio_cuit?: string
  negocio_direccion?: string
  items: { nombre: string; cantidad: number; precio_unitario: number; subtotal: number }[]
  subtotal: number
  descuento: number
  total: number
  tipo_comprobante: 'A' | 'B' | 'C' | 'X'  // X = ticket interno sin ARCA
  cae?: string           // Código de Autorización Electrónica (ARCA)
  cae_vencimiento?: string
}

export function generarTicketPDF(data: TicketData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()

  // ── Encabezado ──────────────────────────────────────────────
  doc.setFillColor(124, 111, 224)
  doc.rect(0, 0, ancho, 30, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text(data.negocio_nombre, 14, 14)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  if (data.negocio_cuit)     doc.text(`CUIT: ${data.negocio_cuit}`, 14, 21)
  if (data.negocio_direccion) doc.text(data.negocio_direccion, 14, 27)

  // Tipo de comprobante (recuadro derecho)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(ancho - 45, 5, 32, 22, 3, 3, 'F')
  doc.setTextColor(124, 111, 224)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text(data.tipo_comprobante, ancho - 32, 20, { align: 'center' })

  // ── Info de factura ──────────────────────────────────────────
  doc.setTextColor(40, 40, 40)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Comprobante Nº ${data.nro_factura}`, 14, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Fecha: ${data.fecha}`, 14, 50)
  doc.text(`Cliente: ${data.cliente_nombre}`, 14, 57)

  // ── Tabla de items ───────────────────────────────────────────
  autoTable(doc, {
    startY: 65,
    head: [['Producto', 'Cant.', 'Precio unit.', 'Subtotal']],
    body: data.items.map(i => [
      i.nombre,
      i.cantidad,
      `$${i.precio_unitario.toLocaleString('es-AR')}`,
      `$${i.subtotal.toLocaleString('es-AR')}`,
    ]),
    headStyles: { fillColor: [124, 111, 224], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 8

  // ── Totales ──────────────────────────────────────────────────
  const xLabel = ancho - 80
  const xValue = ancho - 14

  const linea = (label: string, valor: string, y: number, negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal')
    doc.setFontSize(negrita ? 12 : 10)
    doc.setTextColor(negrita ? 40 : 100, negrita ? 40 : 100, negrita ? 40 : 100)
    doc.text(label, xLabel, y)
    doc.text(valor, xValue, y, { align: 'right' })
  }

  linea('Subtotal:', `$${data.subtotal.toLocaleString('es-AR')}`, finalY)
  if (data.descuento > 0) linea('Descuento:', `-$${data.descuento.toLocaleString('es-AR')}`, finalY + 7)
  
  // Línea separadora
  doc.setDrawColor(124, 111, 224)
  doc.line(xLabel, finalY + 10, ancho - 14, finalY + 10)
  linea('TOTAL:', `$${data.total.toLocaleString('es-AR')}`, finalY + 17, true)

  // ── CAE (si viene de ARCA) ───────────────────────────────────
  if (data.cae) {
    const caeY = finalY + 28
    doc.setFillColor(240, 240, 250)
    doc.roundedRect(14, caeY, ancho - 28, 20, 3, 3, 'F')
    doc.setTextColor(80, 80, 80)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Comprobante autorizado por ARCA', 20, caeY + 7)
    doc.setFont('helvetica', 'normal')
    doc.text(`CAE: ${data.cae}`, 20, caeY + 13)
    doc.text(`Vencimiento CAE: ${data.cae_vencimiento}`, 100, caeY + 13)
  }

  // ── Pie ──────────────────────────────────────────────────────
  doc.setTextColor(160, 160, 160)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Generado por StockFlow — software de gestión PyME', ancho / 2, 285, { align: 'center' })

  return doc.output('blob')
}

export function descargarTicket(data: TicketData) {
  const blob = generarTicketPDF(data)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${data.nro_factura}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export async function ticketBase64(data: TicketData): Promise<string> {
  const blob = generarTicketPDF(data)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}