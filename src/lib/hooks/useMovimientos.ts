'use client'
import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveLocal } from '@/lib/db/indexeddb'
import { useTableSync } from './useTableSync'

export type Movimiento = {
  id: string
  org_id?: string
  descripcion: string
  tipo: 'ingreso' | 'egreso'
  categoria_nombre: string | null
  monto: number
  fecha: string
  venta_id: string | null
  created_at: string
}

export function useMovimientos() {
  const {
    data: movimientos,
    loading,
    orgId,
    setData: setMovimientos,
    refetch: fetchMovimientos,
  } = useTableSync<Movimiento>({
    table: 'movimientos',
    order: { column: 'fecha', ascending: false },
    localSort: (a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''),
  })

  const supabase = createClient()

  const addMovimiento = async (m: Omit<Movimiento, 'id' | 'created_at' | 'venta_id'>) => {
    const nuevo = {
      ...m,
      id: crypto.randomUUID(),
      org_id: orgId!,
      venta_id: null,
      created_at: new Date().toISOString(),
    }

    if (navigator.onLine) {
      const { error } = await supabase.from('movimientos').insert(nuevo)
      if (error) throw new Error(error.message)
    } else {
      await saveLocal('movimientos', nuevo, 'insert')
    }

    setMovimientos(prev => [nuevo, ...prev])
  }

  const deleteMovimiento = async (id: string) => {
    if (navigator.onLine) {
      const { error } = await supabase.from('movimientos').delete().eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      const m = movimientos.find(x => x.id === id)
      if (m) await saveLocal('movimientos', m, 'delete')
    }
    setMovimientos(prev => prev.filter(m => m.id !== id))
  }

  // useMemo evita recalcular en cada render si movimientos no cambio
  const resumen = useMemo(() => ({
    ingresos: movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0),
    egresos: movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0),
  }), [movimientos])

  return { movimientos, loading, addMovimiento, deleteMovimiento, resumen, refetch: fetchMovimientos }
}
