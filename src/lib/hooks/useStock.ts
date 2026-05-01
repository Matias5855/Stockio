'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveLocal, getLocal } from '@/lib/db/indexeddb'
import { getOrgId } from '@/lib/supabase/client'

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
}

export function useStock() {
  const supabase = createClient()
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)

  // Obtener orgId
  useEffect(() => {
  getOrgId().then(id => { if (id) setOrgId(id) })
}, [])

  const fetchLocal = useCallback(async (currentOrgId: string) => {
    try {
      const local = await getLocal('productos', currentOrgId)
      const activos = local.filter((p: any) => p.activo !== false)
      if (activos.length > 0) {
        setProductos(activos)
        return
      }
      //Fallback a localStorage si IndexedDB esta vacio
      const cached = localStorage.getItem('sf_productos_cache')
      if (cached) setProductos(JSON.parse(cached))
    } catch {
      try {
        const cached = localStorage.getItem('sf_productos_cache')
        if (cached) setProductos(JSON.parse(cached))
      } catch {}
    }
  }, [])

  const fetchProductos = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    if (!navigator.onLine) {
      // Offline: usar IndexedDB
      await fetchLocal(orgId)
      setLoading(false)
      return
    }
    try {
      const { data, error } = await supabase
        .from('productos').select('*').eq('org_id', orgId).eq('activo', true).order('nombre')
      if (!error && data) {
        setProductos(data)
        // Guardar en IndexedDB para uso offline
        try {
          localStorage.setItem('sf_productos_cache', JSON.stringify(data))
        } catch {}
        for (const p of data) {
          try { await saveLocal('productos', p, 'update') } catch {}
        }
      }
    } catch {
      // Si falla, usar datos locales
      await fetchLocal(orgId)
    }
    setLoading(false)
  }, [orgId, fetchLocal])

  useEffect(() => {
    if (!orgId) return
    fetchProductos()

    // Solo suscribir al realtime si hay internet
    if (!navigator.onLine) return

    let channel: any = null
    try {
      channel = supabase.channel(`productos_${orgId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, fetchProductos)
        .subscribe()
    } catch {}

    // Escuchar cuando vuelve internet
    const onOnline = () => fetchProductos()
    window.addEventListener('online', onOnline)

    return () => {
      if (channel) try { supabase.removeChannel(channel) } catch {}
      window.removeEventListener('online', onOnline)
    }
  }, [orgId, fetchProductos])

  const addProducto = async (p: Partial<Producto>) => {
    const newId = crypto.randomUUID()
    const producto = {
      id: newId,
      nombre: p.nombre ?? '',
      sku: p.sku?.trim() || `SKU-${Date.now()}`,
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

    // Actualizar UI inmediatamente
    setProductos(prev => [...prev, producto])
  }

  const updateProducto = async (id: string, data: Partial<Producto>) => {
    const updated = { ...productos.find(p => p.id === id), ...data }

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