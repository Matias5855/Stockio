'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveLocal } from '@/lib/db/indexeddb'
import { useTableSync } from './useTableSync'

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
  const {
    data: ventas,
    loading,
    orgId,
    setData: setVentas,
    refetch: fetchVentas,
  } = useTableSync<Venta>({
    table: 'ventas',
    select: '*, venta_items(*)',
    order: { column: 'fecha', ascending: false },
    localSort: (a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''),
  })

  const supabase = createClient()

  // Recuperar ventas offline pendientes del localStorage (backup adicional al IndexedDB)
  useEffect(() => {
    try {
      const pending = JSON.parse(localStorage.getItem('sf_venta_items') || '[]')
      if (pending.length > 0) {
        setVentas(prev => {
          const ids = new Set(prev.map(v => v.id))
          const nuevas = pending.filter((v: Venta) => !ids.has(v.id))
          return [...nuevas, ...prev]
        })
      }
    } catch {}
  }, [setVentas])

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
      const { count } = await supabase
        .from('ventas').select('*', { count: 'exact', head: true })
      const nroFinal = `FC-${String((count ?? 0) + 1).padStart(4, '0')}`
      nuevaVenta.nro_factura = nroFinal

      const { data, error } = await supabase
        .from('ventas').insert({ ...venta, org_id: orgId!, nro_factura: nroFinal }).select().single()
      if (error) throw new Error(error.message)

      // Items + movimiento de caja en paralelo (no dependen entre si)
      await Promise.all([
        supabase.from('venta_items').insert(items.map(i => ({ ...i, venta_id: data.id }))),
        supabase.from('movimientos').insert({
          descripcion: `Venta ${nroFinal} — ${venta.cliente_nombre}`,
          tipo: 'ingreso',
          categoria_nombre: 'Ventas',
          monto: venta.total,
          fecha: venta.fecha,
          venta_id: data.id,
          org_id: orgId!,
        }),
      ])
      nuevaVenta.id = data.id
      nuevaVenta.nro_factura = nroFinal
    } else {
      await saveLocal('ventas', { ...nuevaVenta, venta_items: items }, 'insert')
      try {
        const pending = JSON.parse(localStorage.getItem('sf_venta_items') || '[]')
        pending.push({ ...nuevaVenta, venta_items: items })
        localStorage.setItem('sf_venta_items', JSON.stringify(pending))
      } catch {}
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
