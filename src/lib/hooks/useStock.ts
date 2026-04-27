'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Producto = {
  id: string
  nombre: string
  sku: string
  categoria_id: string | null
  proveedor_id: string | null
  cantidad: number
  stock_minimo: number
  precio_venta: number
  costo: number
  activo: boolean
  categoria_nombre?: string
  proveedor_nombre?: string
}

export function useStock() {
  const supabase = createClient()
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('productos')
      .select('*, categorias(nombre), proveedores(nombre)')
      .eq('activo', true)
      .order('nombre')
    setProductos((data ?? []).map((p: any) => ({
      ...p,
      categoria_nombre: p.categorias?.nombre,
      proveedor_nombre: p.proveedores?.nombre,
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()
    const ch = supabase.channel('productos_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, fetch)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetch])

  const addProducto = async (p: Omit<Producto, 'id' | 'activo'>) => {
    const { error } = await supabase.from('productos').insert({ ...p, activo: true })
    if (error) throw new Error(error.message)
  }

  const updateProducto = async (id: string, p: Partial<Producto>) => {
    const { error } = await supabase.from('productos').update(p).eq('id', id)
    if (error) throw new Error(error.message)
  }

  const deleteProducto = async (id: string) => {
    const { error } = await supabase.from('productos').update({ activo: false }).eq('id', id)
    if (error) throw new Error(error.message)
  }

  return { productos, loading, addProducto, updateProducto, deleteProducto, refetch: fetch }
}