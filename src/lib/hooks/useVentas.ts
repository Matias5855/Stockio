'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveLocal, getLocal } from '@/lib/db/indexeddb'
import { getOrgId } from '@/lib/supabase/client'

export type VentaItem = {
  producto_id: string | null
  producto_nombre: string
  cantidad: number
  precio_unitario: number
}

export type Venta = {
  id: string
  org_id?: string
  nro_factura: string
  cliente_nombre: string | null
  fecha: string
  estado: 'cobrada' | 'pendiente' | 'cancelada'
  total: number
  subtotal: number
  descuento: number
  notas: string | null
  created_at: string
  venta_items?: VentaItem[]
}

export function useVentas() {
  const supabase = createClient()
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
  getOrgId().then(id => { if (id) setOrgId(id) })
}, [])

  const fetchVentas = useCallback(async () => {
    if (!orgId) return
    setLoading(true)

    if (!navigator.onLine) {
      try {
        const local = await getLocal('ventas', orgId)
        setVentas(local.sort((a: any, b: any) => b.fecha?.localeCompare(a.fecha)))
      } catch {}
      setLoading(false)
      return
    }

    try {
      const { data } = await supabase
        .from('ventas').select('*, venta_items(*)')
        .eq('org_id', orgId)
        .order('fecha', { ascending: false })
      if (data) {
        setVentas(data)
        for (const v of data) {
          try { await saveLocal('ventas', v, 'update') } catch {}
        }
      }
    } catch {
      try {
        const local = await getLocal('ventas', orgId)
        setVentas(local)
      } catch {}
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    fetchVentas()

    if (!navigator.onLine) return

    let channel: any = null
    try {
      channel = supabase.channel(`ventas_${orgId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, fetchVentas)
        .subscribe()
    } catch {}

    const onOnline = () => fetchVentas()
    window.addEventListener('online', onOnline)

    return () => {
      if (channel) try { supabase.removeChannel(channel) } catch {}
      window.removeEventListener('online', onOnline)
    }
  }, [orgId, fetchVentas])

  const crearVenta = async (
    venta: Omit<Venta, 'id' | 'nro_factura' | 'created_at'>,
    items: VentaItem[]
  ) => {
    const newId = crypto.randomUUID()
    const nro = `FC-${Date.now()}`
    const nuevaVenta = {
      ...venta,
      id: newId,
      org_id: orgId!,
      nro_factura: nro,
      created_at: new Date().toISOString(),
      venta_items: items,
    }

    if (navigator.onLine) {
      try {
        const { count } = await supabase
          .from('ventas').select('*', { count: 'exact', head: true })
        const nroFinal = `FC-${String((count ?? 0) + 1).padStart(4, '0')}`
        nuevaVenta.nro_factura = nroFinal

        const { data, error } = await supabase
          .from('ventas').insert({ ...venta, org_id: orgId!, nro_factura: nroFinal }).select().single()
        if (error) throw new Error(error.message)

        await supabase.from('venta_items').insert(items.map(i => ({ ...i, venta_id: data.id })))
        await supabase.from('movimientos').insert({
          descripcion: `Venta ${nroFinal} — ${venta.cliente_nombre}`,
          tipo: 'ingreso', categoria_nombre: 'Ventas',
          monto: venta.total, fecha: venta.fecha,
          venta_id: data.id, org_id: orgId!,
        })
        nuevaVenta.id = data.id
      } catch (err: any) {
        throw err
      }
    } else {
      await saveLocal('ventas', nuevaVenta, 'insert')
    }

    setVentas(prev => [nuevaVenta as Venta, ...prev])
    return nuevaVenta
  }

  const cambiarEstado = async (id: string, estado: Venta['estado']) => {
    if (navigator.onLine) {
      const { error } = await supabase.from('ventas').update({ estado }).eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      const v = ventas.find(x => x.id === id)
      if (v) await saveLocal('ventas', { ...v, estado }, 'update')
    }
    setVentas(prev => prev.map(v => v.id === id ? { ...v, estado } : v))
  }

  const deleteVenta = async (id: string) => {
    if (navigator.onLine) {
      const { error } = await supabase.from('ventas').delete().eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      const v = ventas.find(x => x.id === id)
      if (v) await saveLocal('ventas', v, 'delete')
    }
    setVentas(prev => prev.filter(v => v.id !== id))
  }

  return { ventas, loading, orgId, crearVenta, cambiarEstado, deleteVenta, refetch: fetchVentas }
}