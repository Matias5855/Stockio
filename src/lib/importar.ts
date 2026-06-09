/**
 * Importacion de productos desde Excel/CSV (planilla de carga masiva).
 *
 * Dos funciones publicas:
 *  - descargarPlantillaStock(): genera y baja un .xlsx con las columnas
 *    correctas + filas de EJEMPLO (con "#" al inicio del SKU para que el
 *    parser las saltee aunque el cliente se olvide de borrarlas).
 *  - parsearStockExcel(file): lee el archivo subido y devuelve las filas
 *    validas, las omitidas (ejemplos/vacias) y los errores por fila.
 *
 * El parser es PURO (no toca la base). La insercion/actualizacion en
 * Supabase la hace useStock.importarProductos() con los resultados.
 *
 * Columnas de la plantilla (los * son guia para el cliente, no obligan al
 * parser salvo nombre y precio de venta, que son los unicos imprescindibles
 * para vender un producto):
 *   SKU | Nombre Producto * | Categoría | Color | Talle |
 *   Stock Inicial | Precio Venta * | Precio Costo | Marca |
 *   Proveedor | Stock Mínimo Alerta
 */
import * as XLSX from 'xlsx'

export type FilaProducto = {
  sku: string
  nombre: string
  categoria: string
  color: string
  talle: string
  cantidad: number
  precio_venta: number
  costo: number
  marca: string
  proveedor: string
  stock_minimo: number
}

export type ResultadoParse = {
  validos: FilaProducto[]
  omitidos: number                            // ejemplos (#) + filas vacias
  errores: { fila: number; motivo: string }[] // fila en numero de Excel (1 = encabezado)
}

// ── Plantilla ────────────────────────────────────────────────────

// Encabezados — coinciden con la plantilla oficial (hoja "Plantilla_Importacion").
const COLUMNAS = [
  'SKU *',
  'Nombre Producto *',
  'Categoría *',
  'Color *',
  'Talle *',
  'Stock Inicial *',
  'Precio Venta *',
  'Precio Costo',
  'Marca',
  'Proveedor',
  'Stock Mínimo Alerta',
] as const

// Filas de ejemplo. El "#" al inicio del SKU hace que el parser las ignore
// aunque el cliente no las borre.
const EJEMPLOS = [
  ['#REM-001-BL-M', 'Remera Básica Manga Corta', 'Remeras', 'Blanco', 'M', 8, 8500, 4200, 'Sin marca', 'Textil Norte', 2],
  ['#ZAP-002-NE-38', 'Zapatilla Urbana', 'Zapatillas', 'Negro', '38', 1, 42000, 22000, 'Topper', 'Dist. Sur', 2],
  ['#PAN-003-AZ-30', 'Pantalón Jean Recto', 'Pantalones', 'Azul', '30', 5, 25000, 13000, 'Wrangler', 'Mayorista GBA', 2],
]

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

export function descargarPlantillaStock(negocio: string) {
  // Fila de ayuda arriba de todo (se ignora al importar porque no es # ni datos validos
  // en la columna SKU; igual el parser arranca buscando el encabezado real).
  const aoa: (string | number)[][] = [
    [...COLUMNAS],
    ...EJEMPLOS,
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 8 },
    { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Importacion')
  XLSX.writeFile(wb, `${slug(negocio)}-plantilla-productos.xlsx`)
}

// ── Parser ───────────────────────────────────────────────────────

// Normaliza un encabezado: minusculas, sin acentos, solo letras/numeros.
// "Precio Venta *" -> "precioventa", "Stock Mínimo Alerta" -> "stockminimoalerta"
function normalizarHeader(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Mapea un encabezado normalizado al campo interno. Acepta variantes comunes
// para soportar tanto la plantilla oficial como Excels propios del cliente.
// El ORDEN importa: chequeamos costo/minimo ANTES que precio/stock genericos.
function campoDeHeader(norm: string): keyof FilaProducto | null {
  if (!norm) return null

  if (norm === 'sku' || norm === 'codigo' || norm === 'cod') return 'sku'

  // Nombre del producto: "Nombre", "Nombre Producto", "Producto", "Artículo",
  // "Descripción", "Detalle", "Prenda", "Item"...
  if (
    norm.startsWith('nombre') || norm === 'producto' || norm === 'productos' ||
    norm.startsWith('articulo') || norm.startsWith('descripcion') ||
    norm === 'detalle' || norm === 'prenda' || norm === 'item'
  ) return 'nombre'

  if (norm.startsWith('categoria') || norm === 'rubro') return 'categoria'
  if (norm === 'color') return 'color'
  if (norm === 'talle' || norm === 'talla' || norm === 'medida') return 'talle'

  // Costo / precio de compra — ANTES que el precio generico (porque
  // "Precio Costo" tambien incluye "precio").
  if (norm.includes('costo') || norm.includes('compra')) return 'costo'

  // Stock minimo / alerta — ANTES que el stock generico.
  if (norm.includes('minimo') || norm.includes('alerta')) return 'stock_minimo'

  // Stock inicial / cantidad / existencia
  if (
    norm.startsWith('stock') || norm === 'cantidad' || norm === 'cant' ||
    norm === 'unidades' || norm === 'existencia' || norm === 'existencias'
  ) return 'cantidad'

  // Precio de venta: "Precio Venta", "Precio", "Venta", "PVP"...
  if (norm.includes('precio') || norm === 'venta' || norm === 'pvp') return 'precio_venta'

  if (norm === 'marca') return 'marca'
  if (norm.startsWith('proveedor')) return 'proveedor'

  return null
}

// Parsea un numero tolerando formato argentino ("9.990", "9.990,50"), simbolos
// de moneda y espacios. Devuelve null si no hay un numero valido.
function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null

  let s = String(v).trim().replace(/[^\d.,-]/g, '') // saca $, espacios, letras
  if (!s) return null

  const tienePunto = s.includes('.')
  const tieneComa = s.includes(',')

  if (tienePunto && tieneComa) {
    // El ultimo separador es el decimal. Formato AR: 9.990,50 -> 9990.50
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // Formato US: 9,990.50
      s = s.replace(/,/g, '')
    }
  } else if (tieneComa) {
    // Solo coma -> decimal (9990,50) salvo que parezca miles (raro). Tratamos como decimal.
    s = s.replace(',', '.')
  }
  // Solo punto: lo dejamos como esta (puede ser decimal o miles; preferimos no romper)

  const n = Number(s)
  return isFinite(n) ? n : null
}

const str = (v: unknown): string => String(v ?? '').trim()

// Normaliza un nombre de hoja para comparaciones.
function normNombreHoja(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

// Ordena las hojas del libro por prioridad de parseo:
//  1. "Plantilla_Importacion" (la oficial)
//  2. cualquier hoja con "plantilla"
//  3. el resto (para soportar Excels propios del cliente con otro formato)
// Excluimos hojas auxiliares conocidas de la plantilla (ejemplos, guias, listas)
// salvo que sean la unica opcion.
function hojasPorPrioridad(wb: XLSX.WorkBook): string[] {
  const AUXILIARES = ['ejemplos', 'guiadecampos', 'categoriasytalles', 'instrucciones']
  const nombres = [...wb.SheetNames]

  const score = (n: string): number => {
    const norm = normNombreHoja(n)
    if (norm === 'plantillaimportacion') return 0
    if (norm.includes('plantilla')) return 1
    if (AUXILIARES.some((a) => norm.includes(a))) return 3
    return 2 // hoja desconocida (posible Excel propio del cliente)
  }

  return nombres.sort((a, b) => score(a) - score(b))
}

// Busca la fila de ENCABEZADOS dentro de una hoja. No asume fila 1: la plantilla
// oficial tiene titulo, instrucciones y una fila "Obligatorio/Opcional" arriba,
// asi que los headers reales estan mas abajo (fila 5). Escanea las primeras
// filas y elige la que mapee mas columnas conocidas, exigiendo al menos
// Nombre + Precio de venta (lo minimo para un producto vendible).
function encontrarFilaHeader(
  rows: unknown[][]
): { headerIdx: number; idx: Partial<Record<keyof FilaProducto, number>> } | null {
  const maxScan = Math.min(rows.length, 30)
  let best: { headerIdx: number; idx: Partial<Record<keyof FilaProducto, number>>; score: number } | null = null

  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] ?? []
    const idx: Partial<Record<keyof FilaProducto, number>> = {}
    let score = 0
    row.forEach((cell, i) => {
      const campo = campoDeHeader(normalizarHeader(cell))
      if (campo && idx[campo] === undefined) { idx[campo] = i; score++ }
    })
    // Header valido: tiene nombre Y precio de venta
    if (idx.nombre !== undefined && idx.precio_venta !== undefined) {
      if (!best || score > best.score) best = { headerIdx: r, idx, score }
    }
  }

  return best ? { headerIdx: best.headerIdx, idx: best.idx } : null
}

// Parsea las filas de UNA hoja (ya como array de arrays). Devuelve null si no
// encuentra una fila de encabezados valida (para poder probar otra hoja).
function parsearRows(rows: unknown[][]): ResultadoParse | null {
  const header = encontrarFilaHeader(rows)
  if (!header) return null

  const { headerIdx, idx } = header
  const get = (row: unknown[], campo: keyof FilaProducto): unknown => {
    const i = idx[campo]
    return i === undefined ? '' : row[i]
  }

  const validos: FilaProducto[] = []
  const errores: { fila: number; motivo: string }[] = []
  let omitidos = 0

  // Datos: desde la fila siguiente al encabezado
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const filaExcel = r + 1 // numero de fila como se ve en Excel (1-based)

    const skuRaw = str(get(row, 'sku'))
    const nombre = str(get(row, 'nombre'))
    const precioRaw = get(row, 'precio_venta')
    const precio_venta = parseNum(precioRaw)
    const hayPrecio = precio_venta != null && precio_venta > 0

    // 1. Fila de EJEMPLO: SKU empieza con "#"
    if (skuRaw.startsWith('#')) { omitidos++; continue }

    // 2. Sin nombre Y sin precio -> fila vacia, separador ("Tus productos van
    //    acá"), o etiqueta. Se ignora silenciosamente (no es error del cliente).
    if (!nombre && !hayPrecio) { omitidos++; continue }

    // 3. Nombre obligatorio
    if (!nombre) { errores.push({ fila: filaExcel, motivo: 'Falta el nombre del producto' }); continue }

    // 4. Precio de venta obligatorio y valido
    if (!hayPrecio) {
      errores.push({ fila: filaExcel, motivo: `Precio de venta inválido ("${str(precioRaw)}")` })
      continue
    }

    // 5. SKU: autogenerar si vino vacio (igual que el alta manual)
    const sku = skuRaw || `SKU-${Date.now()}-${r}`

    validos.push({
      sku,
      nombre,
      categoria: str(get(row, 'categoria')),
      color: str(get(row, 'color')),
      talle: str(get(row, 'talle')),
      cantidad: Math.max(0, Math.trunc(parseNum(get(row, 'cantidad')) ?? 0)),
      precio_venta: precio_venta as number,
      costo: Math.max(0, parseNum(get(row, 'costo')) ?? 0),
      marca: str(get(row, 'marca')),
      proveedor: str(get(row, 'proveedor')),
      stock_minimo: Math.max(0, Math.trunc(parseNum(get(row, 'stock_minimo')) ?? 0)),
    })
  }

  return { validos, omitidos, errores }
}

export async function parsearStockExcel(file: File): Promise<ResultadoParse> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  // Probar las hojas por prioridad: primero "Plantilla_Importacion", despues
  // cualquier otra (para soportar Excels propios del cliente). Usamos la primera
  // que tenga una fila de encabezados con Nombre + Precio.
  for (const nombreHoja of hojasPorPrioridad(wb)) {
    const ws = wb.Sheets[nombreHoja]
    if (!ws) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' })
    const resultado = parsearRows(rows)
    if (resultado) return resultado
  }

  return {
    validos: [], omitidos: 0,
    errores: [{
      fila: 0,
      motivo: 'No encontramos las columnas necesarias. El archivo debe tener al menos columnas de Nombre y Precio (idealmente usá la plantilla de Stockio).',
    }],
  }
}
