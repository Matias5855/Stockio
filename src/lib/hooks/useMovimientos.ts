'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Movimiento = {
  id: string
  descripcion: string
  tipo: 'ingreso' | 'egreso'
  categoria_nombre: string | null
  monto: number
  fecha: string
  venta_id: string | null
  created_at: string
}

export function useMovimientos() {
  const supabase = createClient()
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('movimientos')
      .select('*')
      .order('fecha', { ascending: false })
    setMovimientos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()
    const ch = supabase.channel('movimientos_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, fetch)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetch])

  const addMovimiento = async (m: Omit<Movimiento, 'id' | 'created_at' | 'venta_id'>) => {
    const { error } = await supabase.from('movimientos').insert(m)
    if (error) throw new Error(error.message)
  }

  const deleteMovimiento = async (id: string) => {
    const { error } = await supabase.from('movimientos').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  const resumen = {
    ingresos: movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0),
    egresos: movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0),
  }

  return { movimientos, loading, addMovimiento, deleteMovimiento, resumen, refetch: fetch }
}