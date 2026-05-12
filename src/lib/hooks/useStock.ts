'use client'
import { createClient } from '@/lib/supabase/client'
import { saveLocal } from '@/lib/db/indexeddb'
import { useTableSync } from './useTableSync'

export type Producto = {
  id: string
  org_id: string
  nombre: string
  sku: string
  talle: string | null
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
  }

  const deleteProducto = async (id: string) => {
    if (navigator.onLine) {
      const { error } = await supabase.from('productos').update({ activo: false }).eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      const p = productos.find(x => x.id === id)
      if (p) await saveLocal('productos', { ...p, activo: false }, 'update')
    }
    setProductos(prev => prev.filter(p => p.id !== id))
  }

  return { productos, loading, orgId, addProducto, updateProducto, deleteProducto, refetch: fetchProductos }
}
