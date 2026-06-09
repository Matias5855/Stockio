'use client'
import { createClient } from '@/lib/supabase/client'
import { saveLocal } from '@/lib/db/indexeddb'
import { useTableSync } from './useTableSync'
import { logHistorial } from '@/lib/historial'
import type { FilaProducto } from '@/lib/importar'

export type ResultadoImport = {
  insertados: number
  actualizados: number
  errores: number
  detalleErrores: string[]
}

export type Producto = {
  id: string
  org_id: string
  nombre: string
  sku: string
  talle: string | null
  color: string | null
  cantidad: number
  stock_minimo: number
  precio_venta: number
  costo: number
  activo: boolean
}

export function useStock() {
  const {
    data: productos,
    loading,
    orgId,
    setData: setProductos,
    refetch: fetchProductos,
  } = useTableSync<Producto>({
    table: 'productos',
    filter: { activo: true },
    order: { column: 'nombre', ascending: true },
    // Offline: descartar productos marcados como activo=false
    localFilter: p => p.activo !== false,
  })

  const supabase = createClient()

  const addProducto = async (p: Partial<Producto>) => {
    const producto: Producto = {
      id: crypto.randomUUID(),
      nombre: p.nombre ?? '',
      sku: p.sku?.trim() || `SKU-${Date.now()}`,
      talle: p.talle?.toString().trim() || null,
      color: p.color?.toString().trim() || null,
      cantidad: p.cantidad ?? 0,
      stock_minimo: p.stock_minimo ?? 0,
      precio_venta: p.precio_venta ?? 0,
      costo: p.costo ?? 0,
      org_id: orgId!,
      activo: true,
    }

    if (navigator.onLine) {
      const { error } = await supabase.from('productos').insert(producto)
      if (error) throw new Error(error.message)
    } else {
      await saveLocal('productos', producto, 'insert')
    }

    setProductos(prev => [...prev, producto])
    logHistorial({
      accion: 'crear', entidad: 'producto', entidad_id: producto.id,
      descripcion: `Producto "${producto.nombre}" agregado (cantidad: ${producto.cantidad})`,
    })
  }

  const updateProducto = async (id: string, data: Partial<Producto>) => {
    const existente = productos.find(p => p.id === id)
    const updated = { ...existente, ...data, id }

    if (navigator.onLine) {
      const { error } = await supabase.from('productos').update(data).eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      await saveLocal('productos', updated, 'update')
    }

    setProductos(prev => prev.map(p => p.id === id ? { ...p, ...data } : p))
    if (existente) {
      logHistorial({
        accion: 'editar', entidad: 'producto', entidad_id: id,
        descripcion: `Producto "${existente.nombre}" editado`,
      })
    }
  }

  const deleteProducto = async (id: string) => {
    const existente = productos.find(x => x.id === id)
    if (navigator.onLine) {
      const { error } = await supabase.from('productos').update({ activo: false }).eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      if (existente) await saveLocal('productos', { ...existente, activo: false }, 'update')
    }
    setProductos(prev => prev.filter(p => p.id !== id))
    if (existente) {
      logHistorial({
        accion: 'eliminar', entidad: 'producto', entidad_id: id,
        descripcion: `Producto "${existente.nombre}" eliminado`,
      })
    }
  }

  // Importacion masiva desde Excel/CSV. Recibe las filas ya parseadas y
  // validadas por parsearStockExcel(). Por SKU: si ya existe en la org lo
  // ACTUALIZA, sino lo inserta. Requiere conexion (no soporta offline).
  const importarProductos = async (filas: FilaProducto[]): Promise<ResultadoImport> => {
    const res: ResultadoImport = { insertados: 0, actualizados: 0, errores: 0, detalleErrores: [] }
    if (!orgId) { res.errores = filas.length; res.detalleErrores.push('No se encontró la organización'); return res }
    if (filas.length === 0) return res

    // Probe: detectar si existen las columnas opcionales (categoria_nombre,
    // marca, proveedor_nombre). Si la consulta falla, no las mandamos en el
    // insert/update — sino Supabase rechazaria la operacion entera.
    let extraCols = true
    const probe = await supabase.from('productos').select('categoria_nombre, marca, proveedor_nombre').limit(1)
    if (probe.error) extraCols = false

    // Traer los SKU ya existentes en la org para decidir insert vs update.
    const { data: existentes } = await supabase
      .from('productos').select('id, sku').eq('org_id', orgId)
    const skuToId = new Map<string, string>()
    for (const e of (existentes ?? []) as Array<{ id: string; sku: string }>) {
      if (e.sku) skuToId.set(e.sku, e.id)
    }

    for (const f of filas) {
      // Campos base (siempre existen en la tabla)
      const base: Record<string, unknown> = {
        nombre: f.nombre,
        sku: f.sku,
        talle: f.talle || null,
        color: f.color || null,
        cantidad: f.cantidad,
        stock_minimo: f.stock_minimo,
        precio_venta: f.precio_venta,
        costo: f.costo,
      }
      // Campos opcionales solo si la tabla los tiene
      if (extraCols) {
        base.categoria_nombre = f.categoria || null
        base.marca = f.marca || null
        base.proveedor_nombre = f.proveedor || null
      }

      try {
        const existenteId = skuToId.get(f.sku)
        if (existenteId) {
          const { error } = await supabase.from('productos').update(base).eq('id', existenteId)
          if (error) throw new Error(error.message)
          res.actualizados++
        } else {
          const insertData = { ...base, org_id: orgId, activo: true }
          const { error } = await supabase.from('productos').insert(insertData)
          if (error) throw new Error(error.message)
          res.insertados++
        }
      } catch (e) {
        res.errores++
        if (res.detalleErrores.length < 5) {
          res.detalleErrores.push(`${f.nombre} (${f.sku}): ${e instanceof Error ? e.message : 'error'}`)
        }
      }
    }

    await fetchProductos()
    logHistorial({
      accion: 'crear', entidad: 'producto', entidad_id: orgId,
      descripcion: `Importación masiva: ${res.insertados} nuevos, ${res.actualizados} actualizados`,
    })
    return res
  }

  return { productos, loading, orgId, addProducto, updateProducto, deleteProducto, importarProductos, refetch: fetchProductos }
}
