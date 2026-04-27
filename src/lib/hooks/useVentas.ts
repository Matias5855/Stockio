'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type VentaItem = {
  producto_id: string | null
  producto_nombre: string
  cantidad: number
  precio_unitario: number
}

export type Venta = {
  id: string
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

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ventas')
      .select('*, venta_items(*)')
      .order('fecha', { ascending: false })
    setVentas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()
    const ch = supabase.channel('ventas_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, fetch)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetch])

  const crearVenta = async (venta: Omit<Venta, 'id' | 'nro_factura' | 'created_at'>, items: VentaItem[]) => {
    const { count } = await supabase.from('ventas').select('*', { count: 'exact', head: true })
    const nro = `FC-${String((count ?? 0) + 1).padStart(4, '0')}`
    const { data, error } = await supabase.from('ventas').insert({ ...venta, nro_factura: nro }).select().single()
    if (error) throw new Error(error.message)
    const { error: itemsErr } = await supabase.from('venta_items').insert(items.map(i => ({ ...i, venta_id: data.id })))
    if (itemsErr) throw new Error(itemsErr.message)
    await supabase.from('movimientos').insert({
      descripcion: `Venta ${nro} — ${venta.cliente_nombre}`,
      tipo: 'ingreso',
      categoria_nombre: 'Ventas',
      monto: venta.total,
      fecha: venta.fecha,
      venta_id: data.id,
    })
    return data
  }

  const cambiarEstado = async (id: string, estado: Venta['estado']) => {
    const { error } = await supabase.from('ventas').update({ estado }).eq('id', id)
    if (error) throw new Error(error.message)
  }

  const deleteVenta = async (id: string) => {
    const { error } = await supabase.from('ventas').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  return { ventas, loading, crearVenta, cambiarEstado, deleteVenta, refetch: fetch }
}