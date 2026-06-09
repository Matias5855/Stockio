import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parsearStockExcel } from './importar'

// Construye un File falso a partir de un workbook XLSX (para tests en node).
// XLSX.write con type:'array' ya devuelve un ArrayBuffer (igual que lo que
// retorna File.arrayBuffer() en el browser).
function wbToFile(wb: XLSX.WorkBook): File {
  const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return { arrayBuffer: async () => ab } as unknown as File
}

// Reproduce la plantilla oficial: titulo + instrucciones + fila Obligatorio/Opcional
// + headers en la fila 5 + 3 ejemplos (# en SKU) + separador + productos reales.
// Ademas hojas auxiliares que NO deben parsearse.
function plantillaOficial(): XLSX.WorkBook {
  const aoa: (string | number)[][] = [
    ['STOCKIO — Plantilla de Importación: Ropa y Zapatería'],
    ['Completá esta plantilla con tus productos y subila desde Stockio → Inventario → Importar'],
    ['⚠ Las filas grises de abajo son EJEMPLOS. Empezá desde la fila 9. Las filas con # en el SKU NO se importan.'],
    ['Obligatorio', 'Obligatorio', 'Obligatorio', 'Obligatorio', 'Obligatorio', 'Obligatorio', 'Obligatorio', 'Opcional', 'Opcional', 'Opcional', 'Opcional'],
    ['SKU *', 'Nombre Producto *', 'Categoría *', 'Color *', 'Talle *', 'Stock Inicial *', 'Precio Venta *', 'Precio Costo', 'Marca', 'Proveedor', 'Stock Mínimo Alerta'],
    ['#REM-001-BL-M', 'Remera Básica Manga Corta', 'Remeras', 'Blanco', 'M', 8, 8500, 4200, 'Sin marca', 'Textil Norte', 2],
    ['#ZAP-002-NE-38', 'Zapatilla Urbana', 'Zapatillas', 'Negro', '38', 1, 42000, 22000, 'Topper', 'Dist. Sur', 2],
    ['#PAN-003-AZ-30', 'Pantalón Jean Recto', 'Pantalones', 'Azul', '30', 5, 25000, 13000, 'Wrangler', 'Mayorista GBA', 2],
    ['↓ Tus productos van acá ↓'],
    // Productos reales del cliente:
    ['BUZO-01', 'Buzo canguro', 'Buzos', 'Gris', 'L', 12, 19990, 9000, 'PropiaMarca', 'Prov X', 3],
    ['', 'Campera inflable', 'Camperas', 'Negro', 'XL', 4, 45000, '', '', '', ''], // SKU vacío -> autogenera
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Importacion')
  // Hojas auxiliares con basura que NO debe parsearse
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Esto son ejemplos']]), 'Ejemplos')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Guia']]), 'Guia_de_Campos')
  return wb
}

describe('parsearStockExcel - plantilla oficial', () => {
  it('detecta headers en la fila 5 y parsea solo los productos reales', async () => {
    const res = await parsearStockExcel(wbToFile(plantillaOficial()))

    // 2 productos reales (buzo + campera). Los 3 ejemplos y el separador se omiten.
    expect(res.validos).toHaveLength(2)
    expect(res.errores).toHaveLength(0)
    expect(res.omitidos).toBeGreaterThanOrEqual(4) // 3 ejemplos + separador

    const buzo = res.validos[0]
    expect(buzo.nombre).toBe('Buzo canguro')
    expect(buzo.sku).toBe('BUZO-01')
    expect(buzo.talle).toBe('L')
    expect(buzo.precio_venta).toBe(19990)
    expect(buzo.cantidad).toBe(12)
    expect(buzo.categoria).toBe('Buzos')
  })

  it('autogenera SKU cuando viene vacío', async () => {
    const res = await parsearStockExcel(wbToFile(plantillaOficial()))
    const campera = res.validos[1]
    expect(campera.nombre).toBe('Campera inflable')
    expect(campera.sku).toMatch(/^SKU-/)
  })

  it('ignora las filas de ejemplo (# en SKU)', async () => {
    const res = await parsearStockExcel(wbToFile(plantillaOficial()))
    const skus = res.validos.map((v) => v.sku)
    expect(skus.some((s) => s.startsWith('#'))).toBe(false)
  })
})

describe('parsearStockExcel - Excel propio del cliente', () => {
  it('parsea un Excel con solo Nombre, Talle y Precio (otra hoja, sin plantilla)', async () => {
    const aoa = [
      ['Producto', 'Talle', 'Precio'],
      ['Medias deportivas', 'Único', 1500],
      ['Gorra trucker', 'M', 7800],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'MiInventario')

    const res = await parsearStockExcel(wbToFile(wb))
    expect(res.validos).toHaveLength(2)
    expect(res.validos[0].nombre).toBe('Medias deportivas')
    expect(res.validos[0].talle).toBe('Único')
    expect(res.validos[0].precio_venta).toBe(1500)
    expect(res.validos[1].nombre).toBe('Gorra trucker')
  })

  it('reporta error si no encuentra columnas de Nombre y Precio', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['Cosa', 'Otra'], ['a', 'b']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')

    const res = await parsearStockExcel(wbToFile(wb))
    expect(res.validos).toHaveLength(0)
    expect(res.errores.length).toBeGreaterThan(0)
  })

  it('parsea precios en formato argentino ("19.990,50")', async () => {
    const aoa = [
      ['Nombre', 'Precio Venta'],
      ['Vestido largo', '19.990,50'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')

    const res = await parsearStockExcel(wbToFile(wb))
    expect(res.validos).toHaveLength(1)
    expect(res.validos[0].precio_venta).toBeCloseTo(19990.5)
  })
})
