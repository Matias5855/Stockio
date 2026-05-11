'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveLocal, getLocal } from '@/lib/db/indexeddb'
import { getOrgId } from '@/lib/supabase/client'
import { syncManager } from '@/lib/sync/syncManager'

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
  const supabase = useMemo(() => createClient(), [])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    getOrgId().then(id => { if (id && mountedRef.current) setOrgId(id) })
    return () => { mountedRef.current = false }
  }, [])

  const fetchLocal = useCallback(async (currentOrgId: string) => {
    try {
      const local = await getLocal('productos', currentOrgId)
      const activos = local.filter((p: Producto) => p.activo !== false)
      if (activos.length > 0) {
        if (mountedRef.current) setProductos(activos)
        return
      }
      const cached = localStorage.getItem('sf_productos_cache')
      if (cached && mountedRef.current) setProductos(JSON.parse(cached))
    } catch (err) {
      console.warn('[useStock] fallback localStorage:', err)
      try {
        const cached = localStorage.getItem('sf_productos_cache')
        if (cached && mountedRef.current) setProductos(JSON.parse(cached))
      } catch {}
    }
  }, [])

  const fetchProductos = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    if (!navigator.onLine) {
      await fetchLocal(orgId)
      if (mountedRef.current) setLoading(false)
      return
    }
    try {
      const { data, error } = await supabase
        .from('productos').select('*').eq('org_id', orgId).eq('activo', true).order('nombre')
      if (!error && data) {
        if (mountedRef.current) setProductos(data)
        try { localStorage.setItem('sf_productos_cache', JSON.stringify(data)) } catch {}
        // Paralelizar guardado en IndexedDB (antes era secuencial con for...of await)
        await Promise.all(
          data.map(p => saveLocal('productos', p, 'update').catch(() => {}))
        )
      }
    } catch (err) {
      console.warn('[useStock] fetch fallo, usando local:', err)
      await fetchLocal(orgId)
    }
    if (mountedRef.current) setLoading(false)
  }, [orgId, fetchLocal, supabase])

  useEffect(() => {
    if (!orgId) return
    fetchProductos()

    if (!navigator.onLine) return

    // Suscripcion realtime con cleanup apropiado
    const channel = supabase.channel(`productos_${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, fetchProductos)
      .subscribe()

    // Listener online: usar await en lugar de evento para evitar race condition
    const onOnline = async () => {
      await syncManager.sync()
      if (mountedRef.current) await fetchProductos()
    }
    window.addEventListener('online', onOnline)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('online', onOnline)
    }
  }, [orgId, fetchProductos, supabase])

  const addProducto = async (p: Partial<Producto>) => {
    const producto = {
      id: crypto.randomUUID(),
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
