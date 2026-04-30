'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Producto = {
  id: string
  org_id: string
  nombre: string
  sku: string
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
  const [orgId, setOrgId] = useState<string | null>(null)

  // Obtener org_id del usuario actual
  useEffect(() => {
    const getOrgId = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      if (profile?.org_id) setOrgId(profile.org_id)
    }
    getOrgId()
  }, [])

  const fetchProductos = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('org_id', orgId)
      .eq('activo', true)
      .order('nombre')
    if (!error) setProductos(data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    fetchProductos()
      // Escuchar actualizaciones locales (offline)
    const onLocalUpdate = () => fetchProductosLocal()
    window.addEventListener('localDataUpdated', onLocalUpdate)

    const ch = supabase.channel('productos_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, fetchProductos)
      .subscribe()
    return () => { supabase.removeChannel(ch)
      window.removeEventListener('localDataUpdated', onLocalUpdate)}
  }, [orgId, fetchProductos])

  const addProducto = async (p: Partial<Producto>) => {
    if (!orgId) throw new Error('Sin organización')
    const sku = p.sku?.trim() || `SKU-${Date.now()}`
    const { error } = await supabase.from('productos').insert({
      nombre: p.nombre,
      sku,
      cantidad: p.cantidad ?? 0,
      stock_minimo: p.stock_minimo ?? 0,
      precio_venta: p.precio_venta ?? 0,
      costo: p.costo ?? 0,
      org_id: orgId,
      activo: true,
    })
    if (error) throw new Error(error.message)
  }

  const updateProducto = async (id: string, p: Partial<Producto>) => {
    const { error } = await supabase.from('productos').update(p).eq('id', id).eq('org_id', orgId!)
    if (error) throw new Error(error.message)
  }

  const deleteProducto = async (id: string) => {
    const { error } = await supabase.from('productos').update({ activo: false }).eq('id', id).eq('org_id', orgId!)
    if (error) throw new Error(error.message)
  }

  const fetchProductosLocal = async () => {
    try {
      const { getLocal } = await import('@/lib/db/indexeddb')
      const local = await getLocal('productos', orgId!)
      if (local.length > 0) {
        setProductos(local.filter((p: any) => p.activo !== false))
      }
    } catch {}
  }
  return { productos, loading, orgId, addProducto, updateProducto, deleteProducto, refetch: fetchProductos }
}