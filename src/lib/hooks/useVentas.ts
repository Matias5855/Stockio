'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveLocal } from '@/lib/db/indexeddb'
import { useTableSync } from './useTableSync'
import { logHistorial } from '@/lib/historial'

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
      const pending = JSON.parse(localStorage.getItem('stk_venta_items') || '[]')
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
      // RPC transaccional: valida stock (bloquea si no hay), genera nro de
      // factura atómico e inserta venta + items + movimiento en UNA transacción.
      // Si falta stock, la RPC hace RAISE y NO queda nada a medias.
      const { data, error } = await supabase.rpc('crear_venta_segura', {
        p_venta: {
          cliente_nombre: venta.cliente_nombre,
          fecha: venta.fecha,
          estado: venta.estado,
          subtotal: venta.subtotal,
          descuento: venta.descuento,
          total: venta.total,
          notas: venta.notas,
        },
        p_items: items,
        p_permitir_sin_stock: false,
        p_venta_id: null,
      })

      if (error) {
        const msg = error.message || 'Error al registrar la venta'
        if (msg.includes('STOCK_INSUFICIENTE')) {
          const prod = msg.split('STOCK_INSUFICIENTE:')[1]?.trim() || 'un producto'
          throw new Error(`No hay stock suficiente de "${prod}". La venta no se registró.`)
        }
        throw new Error(msg)
      }

      const res = data as { id: string; nro_factura: string }
      nuevaVenta.id = res.id
      nuevaVenta.nro_factura = res.nro_factura
    } else {
      await saveLocal('ventas', { ...nuevaVenta, venta_items: items }, 'insert')
      try {
        const pending = JSON.parse(localStorage.getItem('stk_venta_items') || '[]')
        pending.push({ ...nuevaVenta, venta_items: items })
        localStorage.setItem('stk_venta_items', JSON.stringify(pending))
      } catch {}
    }

    setVentas(prev => [nuevaVenta as Venta, ...prev])
    logHistorial({
      accion: 'crear', entidad: 'venta', entidad_id: nuevaVenta.id,
      descripcion: `Venta ${nuevaVenta.nro_factura} a ${venta.cliente_nombre ?? 'Consumidor Final'} por $${venta.total.toLocaleString('es-AR')}`,
    })
    return nuevaVenta
  }

  const cambiarEstado = async (id: string, estado: Venta['estado']) => {
    const v = ventas.find(x => x.id === id)
    if (navigator.onLine) {
      const { error } = await supabase.from('ventas').update({ estado }).eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      if (v) await saveLocal('ventas', { ...v, estado }, 'update')
    }
    setVentas(prev => prev.map(x => x.id === id ? { ...x, estado } : x))
    if (v) {
      logHistorial({
        accion: 'cambiar_estado', entidad: 'venta', entidad_id: id,
        descripcion: `Venta ${v.nro_factura} marcada como ${estado}`,
      })
    }
  }

  const deleteVenta = async (id: string) => {
    const v = ventas.find(x => x.id === id)
    if (navigator.onLine) {
      const { error } = await supabase.from('ventas').delete().eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      if (v) await saveLocal('ventas', v, 'delete')
    }
    setVentas(prev => prev.filter(x => x.id !== id))
    if (v) {
      logHistorial({
        accion: 'eliminar', entidad: 'venta', entidad_id: id,
        descripcion: `Venta ${v.nro_factura} eliminada`,
      })
    }
  }

  return { ventas, loading, orgId, crearVenta, cambiarEstado, deleteVenta, refetch: fetchVentas }
}
