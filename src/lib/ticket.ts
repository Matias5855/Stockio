import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface TicketData {
  nro_factura: string
  fecha: string
  cliente_nombre: string
  cliente_cuit?: string
  cliente_direccion?: string
  negocio_nombre: string
  negocio_cuit?: string
  negocio_direccion?: string
  negocio_telefono?: string
  negocio_email?: string
  negocio_iibb?: string
  negocio_inicio_actividades?: string
  items: {
    nombre: string
    cantidad: number
    precio_unitario: number
    subtotal: number
  }[]
  subtotal: number
  descuento: number
  total: number
  tipo_comprobante: 'A' | 'B' | 'C' | 'X'
  condicion_iva_emisor?: string   // Ej: "Responsable Inscripto" | "Monotributista"
  condicion_iva_receptor?: string // Ej: "Consumidor Final"
  condicion_venta?: string        // Ej: "Contado" | "Cuenta Corriente"
  cae?: string
  cae_vencimiento?: string
  punto_venta?: string
}

// Colores
const MORADO = [124, 111, 224] as [number, number, number]
const NEGRO  = [30, 30, 30]   as [number, number, number]
const GRIS   = [100, 100, 100] as [number, number, number]
const GRIS_CLARO = [220, 220, 220] as [number, number, number]
const BLANCO = [255, 255, 255] as [number, number, number]
const VERDE  = [22, 160, 101]  as [number, number, number]

export function generarTicketPDF(data: TicketData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()   // 210
  const H = doc.internal.pageSize.getHeight()  // 297
  const M = 15  // margen

  // ── FONDO ────────────────────────────────────────────────────
  doc.setFillColor(248, 248, 252)
  doc.rect(0, 0, W, H, 'F')

  // ── HEADER — banda superior ───────────────────────────────────
  doc.setFillColor(...MORADO)
  doc.rect(0, 0, W, 38, 'F')

  // Nombre del negocio
  doc.setTextColor(...BLANCO)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(data.negocio_nombre.toUpperCase(), M, 16)

  // Datos del negocio
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const linea1 = [
    data.negocio_cuit ? `CUIT: ${formatCUIT(data.negocio_cuit)}` : '',
    data.negocio_iibb ? `IIBB: ${data.negocio_iibb}` : '',
    data.condicion_iva_emisor ? `IVA: ${data.condicion_iva_emisor}` : '',
  ].filter(Boolean).join('   |   ')
  const linea2 = [
    data.negocio_direccion ?? '',
    data.negocio_telefono ? `Tel: ${data.negocio_telefono}` : '',
    data.negocio_email ?? '',
  ].filter(Boolean).join('   |   ')

  if (linea1) doc.text(linea1, M, 24)
  if (linea2) doc.text(linea2, M, 29)
  if (data.negocio_inicio_actividades) {
    doc.text(`Inicio de actividades: ${data.negocio_inicio_actividades}`, M, 34)
  }

  // ── RECUADRO TIPO DE COMPROBANTE (derecha del header) ─────────
  const tipoW = 42
  const tipoX = W - M - tipoW
  doc.setFillColor(...BLANCO)
  doc.roundedRect(tipoX, 4, tipoW, 30, 3, 3, 'F')

  // Letra grande del tipo
  doc.setTextColor(...MORADO)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text(data.tipo_comprobante, tipoX + tipoW / 2, 22, { align: 'center' })

  // Descripción del tipo
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  const tipoDesc: Record<string, string> = {
    A: 'FACTURA A', B: 'FACTURA B', C: 'FACTURA C', X: 'COMPROBANTE',
  }
  doc.text(tipoDesc[data.tipo_comprobante] ?? 'COMPROBANTE', tipoX + tipoW / 2, 30, { align: 'center' })

  // ── DATOS DEL COMPROBANTE ─────────────────────────────────────
  let y = 46

  doc.setFillColor(...BLANCO)
  doc.roundedRect(M, y, W - M * 2, 28, 3, 3, 'F')
  doc.setDrawColor(...GRIS_CLARO)
  doc.roundedRect(M, y, W - M * 2, 28, 3, 3, 'S')

  // Columna izquierda — datos del comprobante
  y += 7
  doc.setTextColor(...GRIS)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')

  const puntoVenta = data.punto_venta ?? '0001'
  const nroSolo = data.nro_factura.replace(/^FC-/, '').padStart(8, '0')

  doc.text('Punto de Venta:', M + 4, y)
  doc.setTextColor(...NEGRO)
  doc.setFont('helvetica', 'bold')
  doc.text(puntoVenta.padStart(4, '0'), M + 30, y)

  y += 6
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')
  doc.text('Nro. Comprobante:', M + 4, y)
  doc.setTextColor(...NEGRO)
  doc.setFont('helvetica', 'bold')
  doc.text(nroSolo, M + 30, y)

  y += 6
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')
  doc.text('Fecha de emisión:', M + 4, y)
  doc.setTextColor(...NEGRO)
  doc.setFont('helvetica', 'bold')
  doc.text(formatFecha(data.fecha), M + 30, y)

  // Columna derecha — condiciones
  const col2X = W / 2 + 5
  y -= 12
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')
  doc.text('Condición de venta:', col2X, y)
  doc.setTextColor(...NEGRO)
  doc.setFont('helvetica', 'bold')
  doc.text(data.condicion_venta ?? 'Contado', col2X + 32, y)

  if (data.condicion_iva_receptor) {
    y += 6
    doc.setTextColor(...GRIS)
    doc.setFont('helvetica', 'normal')
    doc.text('Cond. IVA receptor:', col2X, y)
    doc.setTextColor(...NEGRO)
    doc.setFont('helvetica', 'bold')
    doc.text(data.condicion_iva_receptor, col2X + 32, y)
  }

  // ── DATOS DEL CLIENTE ─────────────────────────────────────────
  y = 82

  // Título sección
  doc.setFillColor(...MORADO)
  doc.roundedRect(M, y, W - M * 2, 7, 2, 2, 'F')
  doc.setTextColor(...BLANCO)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('DATOS DEL RECEPTOR', M + 4, y + 5)

  y += 10
  doc.setFillColor(...BLANCO)
  doc.roundedRect(M, y, W - M * 2, 20, 2, 2, 'F')
  doc.setDrawColor(...GRIS_CLARO)
  doc.roundedRect(M, y, W - M * 2, 20, 2, 2, 'S')

  y += 6
  doc.setTextColor(...GRIS)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Apellido y Nombre / Razón Social:', M + 4, y)
  doc.setTextColor(...NEGRO)
  doc.setFont('helvetica', 'bold')
  doc.text(data.cliente_nombre, M + 60, y)

  y += 7
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')

  if (data.cliente_cuit) {
    doc.text('CUIT / CUIL / DNI:', M + 4, y)
    doc.setTextColor(...NEGRO)
    doc.setFont('helvetica', 'bold')
    doc.text(formatCUIT(data.cliente_cuit), M + 35, y)
  } else {
    doc.text('Consumidor Final', M + 4, y)
  }

  if (data.cliente_direccion) {
    doc.setTextColor(...GRIS)
    doc.setFont('helvetica', 'normal')
    doc.text('Domicilio:', col2X, y)
    doc.setTextColor(...NEGRO)
    doc.setFont('helvetica', 'bold')
    doc.text(data.cliente_direccion, col2X + 20, y)
  }

  // ── TABLA DE ITEMS ────────────────────────────────────────────
  y = 116

  doc.setFillColor(...MORADO)
  doc.roundedRect(M, y, W - M * 2, 7, 2, 2, 'F')
  doc.setTextColor(...BLANCO)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('DETALLE DE PRODUCTOS / SERVICIOS', M + 4, y + 5)

  y += 8

  autoTable(doc, {
    startY: y,
    head: [['Código', 'Descripción', 'Cant.', 'Precio Unit.', 'Subtotal']],
    body: data.items.map((item, idx) => [
      String(idx + 1).padStart(3, '0'),
      item.nombre,
      item.cantidad,
      formatMoneda(item.precio_unitario),
      formatMoneda(item.subtotal),
    ]),
    headStyles: {
      fillColor: [45, 40, 80],
      textColor: BLANCO,
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: NEGRO,
      cellPadding: 3.5,
    },
    alternateRowStyles: {
      fillColor: [244, 243, 252],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 18 },
      1: { halign: 'left',   cellWidth: 90 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'right',  cellWidth: 30 },
      4: { halign: 'right',  cellWidth: 30 },
    },
    margin: { left: M, right: M },
    tableLineColor: GRIS_CLARO,
    tableLineWidth: 0.3,
  })

  // ── TOTALES ───────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable.finalY + 4
  const totX = W - M - 75
  const totW = 75

  doc.setFillColor(...BLANCO)
  doc.roundedRect(totX, finalY, totW, data.descuento > 0 ? 34 : 26, 3, 3, 'F')
  doc.setDrawColor(...GRIS_CLARO)
  doc.roundedRect(totX, finalY, totW, data.descuento > 0 ? 34 : 26, 3, 3, 'S')

  let ty = finalY + 7
  doc.setFontSize(8.5)
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')
  doc.text('Subtotal:', totX + 4, ty)
  doc.setTextColor(...NEGRO)
  doc.text(formatMoneda(data.subtotal), totX + totW - 4, ty, { align: 'right' })

  if (data.descuento > 0) {
    ty += 7
    doc.setTextColor(...GRIS)
    doc.text('Descuento:', totX + 4, ty)
    doc.setTextColor([200, 50, 50] as any)
    doc.text(`- ${formatMoneda(data.descuento)}`, totX + totW - 4, ty, { align: 'right' })
  }

  // Línea separadora
  ty += 4
  doc.setDrawColor(...MORADO)
  doc.setLineWidth(0.8)
  doc.line(totX + 4, ty, totX + totW - 4, ty)
  ty += 6

  // Total destacado
  doc.setFillColor(...MORADO)
  doc.roundedRect(totX, ty - 4, totW, 12, 2, 2, 'F')
  doc.setTextColor(...BLANCO)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAL:', totX + 5, ty + 4)
  doc.text(formatMoneda(data.total), totX + totW - 5, ty + 4, { align: 'right' })

  // ── CAE ───────────────────────────────────────────────────────
  if (data.cae) {
    const caeY = finalY
    doc.setFillColor(240, 248, 255)
    doc.roundedRect(M, caeY, 90, 26, 3, 3, 'F')
    doc.setDrawColor(...VERDE)
    doc.setLineWidth(0.5)
    doc.roundedRect(M, caeY, 90, 26, 3, 3, 'S')

    doc.setTextColor(...VERDE)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.text('✓ COMPROBANTE AUTORIZADO POR ARCA (AFIP)', M + 4, caeY + 7)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...NEGRO)
    doc.text(`CAE N°: ${data.cae}`, M + 4, caeY + 14)
    doc.text(`Fecha de Vencimiento CAE: ${formatFecha(data.cae_vencimiento ?? '')}`, M + 4, caeY + 20)

    // Código de barras simulado (líneas verticales decorativas)
    for (let i = 0; i < 40; i++) {
      const x = M + 4 + i * 2.1
      const h = i % 3 === 0 ? 6 : 4
      doc.setDrawColor(i % 2 === 0 ? 30 : 100, 30, 30)
      doc.setLineWidth(i % 3 === 0 ? 1.2 : 0.6)
      doc.line(x, caeY + 23, x, caeY + 23 + h)
    }
  }

  // ── PIE DE PÁGINA ─────────────────────────────────────────────
  const pieY = H - 18
  doc.setFillColor(...MORADO)
  doc.rect(0, pieY, W, 18, 'F')

  doc.setTextColor(...BLANCO)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Este comprobante fue generado digitalmente por StockFlow — Software de Gestión PyME', W / 2, pieY + 7, { align: 'center' })
  doc.text(`Fecha de impresión: ${formatFechaHora(new Date().toISOString())}`, W / 2, pieY + 13, { align: 'center' })

  // Número de página
  doc.setFontSize(7)
  doc.text('Página 1 de 1', W - M, pieY + 10, { align: 'right' })

  return doc.output('blob')
}

// ── HELPERS ───────────────────────────────────────────────────
function formatMoneda(n: number): string {
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCUIT(cuit: string): string {
  const clean = cuit.replace(/\D/g, '')
  if (clean.length === 11) return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`
  return cuit
}

function formatFecha(fecha: string): string {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-')
  if (!y || !m || !d) return fecha
  return `${d}/${m}/${y}`
}

function formatFechaHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

// ── EXPORTAR ──────────────────────────────────────────────────
export function descargarTicket(data: TicketData) {
  const blob = generarTicketPDF(data)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${data.tipo_comprobante}-${data.nro_factura}.pdf`
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