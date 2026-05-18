/**
 * Generacion de Factura C (Codigo 11) en formato AFIP/ARCA estandar argentino.
 *
 * El layout es siempre el mismo — solo cambian los items, totales, datos del
 * cliente y la info del emisor (que viene de la tabla `organizations`).
 *
 * Layout fiel al modelo AFIP:
 *   - "ORIGINAL" arriba centrado
 *   - Recuadro con la letra "C" y "COD. 11" + titulo "FACTURA"
 *   - Punto de venta + Comp. Nro a la derecha
 *   - Datos del emisor (Razon Social, CUIT, IIBB, Inicio actividades, etc.)
 *   - Periodo facturado / Vto. de pago
 *   - Datos del receptor
 *   - Tabla de items (Codigo, Producto/Servicio, Cant., U. Medida, Precio
 *     Unit., % Bonif., Imp. Bonif., Subtotal)
 *   - Totales a la derecha
 *   - CAE en footer con codigo de barras simulado
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface TicketItem {
  nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  codigo?: string
  unidad_medida?: string // default 'un'
  bonif_pct?: number     // % de bonificacion
  imp_bonif?: number     // monto bonificado
}

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
  items: TicketItem[]
  subtotal: number
  descuento: number
  total: number
  /** Siempre 'C' — campo legacy, se ignora */
  tipo_comprobante?: 'A' | 'B' | 'C' | 'X'
  condicion_iva_emisor?: string
  condicion_iva_receptor?: string
  condicion_venta?: string
  cae?: string
  cae_vencimiento?: string
  punto_venta?: string
  periodo_desde?: string
  periodo_hasta?: string
  fecha_vto_pago?: string
}

// Paleta: factura tradicional blanco/negro con grises de soporte
const NEGRO       = [0, 0, 0]       as [number, number, number]
const GRIS_TEXTO  = [80, 80, 80]    as [number, number, number]
const GRIS_BORDE  = [120, 120, 120] as [number, number, number]
const GRIS_FONDO  = [240, 240, 240] as [number, number, number]

export function generarTicketPDF(data: TicketData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()   // 210
  const H = doc.internal.pageSize.getHeight()  // 297
  const M = 10  // margen exterior

  doc.setDrawColor(...NEGRO)
  doc.setTextColor(...NEGRO)
  doc.setLineWidth(0.3)

  // ──────────────────────────────────────────────────────────────
  // ENCABEZADO: "ORIGINAL" centrado
  // ──────────────────────────────────────────────────────────────
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('ORIGINAL', W / 2, M + 4, { align: 'center' })

  // Linea horizontal debajo de "ORIGINAL"
  doc.setLineWidth(0.5)
  doc.line(M, M + 6, W - M, M + 6)

  // ──────────────────────────────────────────────────────────────
  // CABECERA: recuadro "C COD. 11" a la izquierda + bloque FACTURA
  // con todos los datos del comprobante a la derecha, stacked.
  // ──────────────────────────────────────────────────────────────
  const headerY = M + 10

  // Recuadro "C" — centrado horizontalmente, formato AFIP
  const letraSize = 18
  const letraX = W / 2 - letraSize / 2
  const letraY = headerY
  doc.setLineWidth(0.5)
  doc.rect(letraX, letraY, letraSize, letraSize)

  // Letra "C" grande dentro del recuadro
  doc.setFontSize(26)
  doc.setFont('helvetica', 'bold')
  doc.text('C', letraX + letraSize / 2, letraY + 13.5, { align: 'center' })

  // "COD. 11" debajo del recuadro
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('COD. 11', letraX + letraSize / 2, letraY + letraSize + 3, { align: 'center' })

  // Bloque "FACTURA" + datos del comprobante — a la derecha del recuadro
  const blockX = letraX + letraSize + 8
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('FACTURA', blockX, letraY + 6)

  // Datos del comprobante en columna stacked (alineados a blockX)
  doc.setFontSize(8.5)
  const puntoVenta = (data.punto_venta ?? '0002').padStart(4, '0')
  const nroSolo = data.nro_factura.replace(/^FC-/, '').replace(/^CTA-/, '').replace(/\D/g, '').padStart(8, '0') || '00000001'

  let cy = letraY + 11
  doc.setFont('helvetica', 'bold')
  doc.text('Punto de Venta: ', blockX, cy)
  doc.setFont('helvetica', 'normal')
  doc.text(puntoVenta, blockX + 28, cy)
  doc.setFont('helvetica', 'bold')
  doc.text('Comp. Nro: ', blockX + 45, cy)
  doc.setFont('helvetica', 'normal')
  doc.text(nroSolo, blockX + 65, cy)

  cy += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Fecha de Emisión: ', blockX, cy)
  doc.setFont('helvetica', 'normal')
  doc.text(formatFecha(data.fecha), blockX + 30, cy)

  cy += 5
  doc.setFont('helvetica', 'bold')
  doc.text('CUIT: ', blockX, cy)
  doc.setFont('helvetica', 'normal')
  doc.text(data.negocio_cuit ? formatCUIT(data.negocio_cuit) : '—', blockX + 12, cy)

  cy += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Ingresos Brutos: ', blockX, cy)
  doc.setFont('helvetica', 'normal')
  doc.text(data.negocio_iibb ?? '—', blockX + 28, cy)

  cy += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Fecha de Inicio de Actividades: ', blockX, cy)
  doc.setFont('helvetica', 'normal')
  doc.text(data.negocio_inicio_actividades ?? '—', blockX + 53, cy)

  const headerH = (cy - letraY) + 6  // altura total ocupada por el header

  // ──────────────────────────────────────────────────────────────
  // DATOS DEL EMISOR
  // ──────────────────────────────────────────────────────────────
  let y = headerY + headerH + 4

  // Linea separadora
  doc.setLineWidth(0.5)
  doc.line(M, y - 2, W - M, y - 2)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text(`Razón Social: `, M, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.negocio_nombre ?? '—', M + 24, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Domicilio Comercial: ', M, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.negocio_direccion ?? '—', M + 31, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Condición frente al IVA: ', M, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.condicion_iva_emisor ?? 'Responsable Monotributo', M + 37, y)

  // ──────────────────────────────────────────────────────────────
  // PERIODO FACTURADO + VTO PAGO (recuadro horizontal con divisiones)
  // ──────────────────────────────────────────────────────────────
  y += 5
  doc.setLineWidth(0.3)
  doc.setFillColor(...GRIS_FONDO)
  doc.rect(M, y, W - 2 * M, 7, 'FD')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Período Facturado Desde: ', M + 2, y + 4.5)
  doc.setFont('helvetica', 'normal')
  doc.text(data.periodo_desde ?? formatFecha(data.fecha), M + 42, y + 4.5)

  // Divisor vertical
  doc.line(W / 2 - 18, y, W / 2 - 18, y + 7)
  doc.setFont('helvetica', 'bold')
  doc.text('Hasta: ', W / 2 - 16, y + 4.5)
  doc.setFont('helvetica', 'normal')
  doc.text(data.periodo_hasta ?? formatFecha(data.fecha), W / 2 - 4, y + 4.5)

  // Divisor vertical
  doc.line(W / 2 + 30, y, W / 2 + 30, y + 7)
  doc.setFont('helvetica', 'bold')
  doc.text('Fecha de Vto. para el pago: ', W / 2 + 32, y + 4.5)
  doc.setFont('helvetica', 'normal')
  doc.text(data.fecha_vto_pago ?? formatFecha(data.fecha), W - M - 22, y + 4.5)

  // ──────────────────────────────────────────────────────────────
  // DATOS DEL RECEPTOR
  // ──────────────────────────────────────────────────────────────
  y += 11

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text('CUIT: ', M, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.cliente_cuit ? formatCUIT(data.cliente_cuit) : '—', M + 11, y)

  doc.setFont('helvetica', 'bold')
  doc.text('Apellido y Nombre / Razón Social: ', M + 70, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.cliente_nombre ?? 'Consumidor Final', M + 121, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Condición frente al IVA: ', M, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.condicion_iva_receptor ?? 'Consumidor Final', M + 37, y)

  doc.setFont('helvetica', 'bold')
  doc.text('Domicilio: ', M + 100, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.cliente_direccion ?? '—', M + 117, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Condición de venta: ', M, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.condicion_venta ?? 'Contado', M + 32, y)

  // ──────────────────────────────────────────────────────────────
  // TABLA DE ITEMS
  // ──────────────────────────────────────────────────────────────
  y += 8

  const bodyRows = data.items.map((item, idx) => [
    item.codigo ?? String(idx + 1).padStart(3, '0'),
    item.nombre,
    String(item.cantidad),
    item.unidad_medida ?? 'un',
    formatMoneda(item.precio_unitario),
    (item.bonif_pct ?? 0).toFixed(2),
    formatMoneda(item.imp_bonif ?? 0),
    formatMoneda(item.subtotal),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Código', 'Producto / Servicio', 'Cantidad', 'U. Medida', 'Precio Unit.', '% Bonif.', 'Imp. Bonif.', 'Subtotal']],
    body: bodyRows,
    headStyles: {
      fillColor: GRIS_FONDO,
      textColor: NEGRO,
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      cellPadding: 2.5,
      lineColor: GRIS_BORDE,
      lineWidth: 0.3,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: NEGRO,
      cellPadding: 2.5,
      lineColor: GRIS_BORDE,
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 18 },
      1: { halign: 'left',   cellWidth: 65 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'right',  cellWidth: 22 },
      5: { halign: 'right',  cellWidth: 15 },
      6: { halign: 'right',  cellWidth: 17 },
      7: { halign: 'right',  cellWidth: 19 },
    },
    margin: { left: M, right: M },
    theme: 'grid',
  })

  // ──────────────────────────────────────────────────────────────
  // TOTALES (parte inferior derecha)
  // ──────────────────────────────────────────────────────────────
  type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } }
  const finalTableY = (doc as AutoTableDoc).lastAutoTable?.finalY ?? y + 50

  // Reservamos espacio bottom-right para los totales (alineado a la altura
  // del modelo AFIP: bien al fondo de la pagina)
  const totY = Math.max(finalTableY + 6, H - 60)
  const totX = W - M - 70
  const totW = 70

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')

  // Subtotal
  doc.text('Subtotal: $', totX, totY)
  doc.setFont('helvetica', 'normal')
  doc.text(formatMoneda(data.subtotal, false), totX + totW, totY, { align: 'right' })

  // Importe Otros Tributos (siempre 0 en Factura C)
  doc.setFont('helvetica', 'bold')
  doc.text('Importe Otros Tributos: $', totX, totY + 5)
  doc.setFont('helvetica', 'normal')
  doc.text(formatMoneda(0, false), totX + totW, totY + 5, { align: 'right' })

  // Importe Total
  doc.setFont('helvetica', 'bold')
  doc.text('Importe Total: $', totX, totY + 10)
  doc.text(formatMoneda(data.total, false), totX + totW, totY + 10, { align: 'right' })

  // ──────────────────────────────────────────────────────────────
  // FOOTER: CAE, codigo de barras simulado, comprobante autorizado
  // ──────────────────────────────────────────────────────────────
  const footerY = H - 22

  // Linea separadora superior del footer
  doc.setLineWidth(0.3)
  doc.line(M, footerY, W - M, footerY)

  // AFIP logo area (placeholder rectangulo)
  doc.setLineWidth(0.2)
  doc.rect(M, footerY + 2, 18, 14)
  doc.setFontSize(6)
  doc.setFont('helvetica', 'bold')
  doc.text('ARCA', M + 9, footerY + 9, { align: 'center' })
  doc.setFontSize(5)
  doc.setFont('helvetica', 'normal')
  doc.text('AFIP', M + 9, footerY + 13, { align: 'center' })

  // "Comprobante Autorizado" debajo
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('Comprobante Autorizado', M + 22, footerY + 12)

  // Pagina al centro
  doc.text('Pág. 1/1', W / 2, footerY + 12, { align: 'center' })

  // CAE Nº a la derecha
  doc.setFont('helvetica', 'bold')
  doc.text('CAE Nº:', W - M - 50, footerY + 8)
  doc.setFont('helvetica', 'normal')
  doc.text(data.cae ?? '—', W - M - 30, footerY + 8)

  if (data.cae_vencimiento) {
    doc.setFont('helvetica', 'bold')
    doc.text('Vto. CAE:', W - M - 50, footerY + 13)
    doc.setFont('helvetica', 'normal')
    doc.text(formatFecha(data.cae_vencimiento), W - M - 30, footerY + 13)
  }

  // Marca de generacion al fondo
  doc.setFontSize(5.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...GRIS_TEXTO)
  doc.text(
    `Generado por Stockio · ${formatFechaHora(new Date().toISOString())}`,
    W / 2,
    H - 3,
    { align: 'center' }
  )

  return doc.output('blob')
}

// ── HELPERS ───────────────────────────────────────────────────
function formatMoneda(n: number, withSymbol = true): string {
  const num = (Number(n) || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return withSymbol ? `$ ${num}` : num
}

function formatCUIT(cuit: string): string {
  const clean = cuit.replace(/\D/g, '')
  if (clean.length === 11) return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`
  return cuit
}

function formatFecha(fecha: string): string {
  if (!fecha) return ''
  // Acepta YYYY-MM-DD o DD/MM/YYYY
  if (fecha.includes('/')) return fecha
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
  a.download = `FacturaC-${data.nro_factura}.pdf`
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
