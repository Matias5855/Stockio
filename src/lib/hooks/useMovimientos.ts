'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveLocal, getLocal } from '@/lib/db/indexeddb'
import { getOrgId } from '@/lib/supabase/client'
import { syncManager } from '@/lib/sync/syncManager'
import { debounce } from '@/lib/utils/debounce'

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
  const supabase = useMemo(() => createClient(), [])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    getOrgId().then(id => { if (id && mountedRef.current) setOrgId(id) })
    return () => { mountedRef.current = false }
  }, [])

  const fetchMovimientos = useCallback(async () => {
    if (!orgId) return
    setLoading(true)

    if (!navigator.onLine) {
      try {
        const local = await getLocal('movimientos', orgId)
        if (mountedRef.current) {
          setMovimientos(local.sort((a: Movimiento, b: Movimiento) => b.fecha?.localeCompare(a.fecha)))
        }
      } catch (err) {
        console.warn('[useMovimientos] error leyendo local:', err)
      }
      if (mountedRef.current) setLoading(false)
      return
    }

    try {
      const { data } = await supabase
        .from('movimientos').select('*')
        .eq('org_id', orgId)
        .order('fecha', { ascending: false })
      if (data) {
        if (mountedRef.current) setMovimientos(data)
        // Paralelizar guardado en IndexedDB
        await Promise.all(
          data.map(m => saveLocal('movimientos', m, 'update').catch(() => {}))
        )
      }
    } catch (err) {
      console.warn('[useMovimientos] fetch fallo, usando local:', err)
      try {
        const local = await getLocal('movimientos', orgId)
        if (mountedRef.current) setMovimientos(local)
      } catch {}
    }
    if (mountedRef.current) setLoading(false)
  }, [orgId, supabase])

  useEffect(() => {
    if (!orgId) return
    fetchMovimientos()

    if (!navigator.onLine) return

    const debouncedFetch = debounce(() => { if (mountedRef.current) fetchMovimientos() }, 500)

    const channel = supabase.channel(`movimientos_${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, debouncedFetch)
      .subscribe()

    const onOnline = async () => {
      await syncManager.sync()
      if (mountedRef.current) await fetchMovimientos()
    }
    window.addEventListener('online', onOnline)

    return () => {
      debouncedFetch.cancel()
      supabase.removeChannel(channel)
      window.removeEventListener('online', onOnline)
    }
  }, [orgId, fetchMovimientos, supabase])

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
