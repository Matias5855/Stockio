'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveLocal, getLocal } from '@/lib/db/indexeddb'

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
  const supabase = createClient()
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    const getOrgId = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles').select('org_id').eq('id', user.id).single()
        if (profile?.org_id) setOrgId(profile.org_id)
      } catch {}
    }
    getOrgId()
  }, [])

  const fetchMovimientos = useCallback(async () => {
    if (!orgId) return
    setLoading(true)

    if (!navigator.onLine) {
      try {
        const local = await getLocal('movimientos', orgId)
        setMovimientos(local.sort((a: any, b: any) => b.fecha?.localeCompare(a.fecha)))
      } catch {}
      setLoading(false)
      return
    }

    try {
      const { data } = await supabase
        .from('movimientos').select('*')
        .eq('org_id', orgId)
        .order('fecha', { ascending: false })
      if (data) {
        setMovimientos(data)
        for (const m of data) {
          try { await saveLocal('movimientos', m, 'update') } catch {}
        }
      }
    } catch {
      try {
        const local = await getLocal('movimientos', orgId)
        setMovimientos(local)
      } catch {}
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    fetchMovimientos()

    if (!navigator.onLine) return

    let channel: any = null
    try {
      channel = supabase.channel(`movimientos_${orgId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, fetchMovimientos)
        .subscribe()
    } catch {}

    const onOnline = () => fetchMovimientos()
    window.addEventListener('online', onOnline)

    return () => {
      if (channel) try { supabase.removeChannel(channel) } catch {}
      window.removeEventListener('online', onOnline)
    }
  }, [orgId, fetchMovimientos])

  const addMovimiento = async (m: Omit<Movimiento, 'id' | 'created_at' | 'venta_id'>) => {
    const newId = crypto.randomUUID()
    const nuevo = {
      ...m,
      id: newId,
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

  const resumen = {
    ingresos: movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0),
    egresos: movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0),
  }

  return { movimientos, loading, addMovimiento, deleteMovimiento, resumen, refetch: fetchMovimientos }
}