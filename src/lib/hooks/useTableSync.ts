'use client'
/**
 * Hook generico para sincronizacion de tabla con Supabase + IndexedDB offline.
 *
 * Maneja:
 * - Obtencion de orgId (cacheado via getOrgId)
 * - Fetch online (Supabase) con fallback a offline (IndexedDB)
 * - Suscripcion realtime con debounce de 500ms y cleanup
 * - Listener de evento "online" que dispara syncManager + refetch
 * - Cleanup correcto en unmount (no setState tras unmount)
 *
 * IMPORTANTE: las options (filter, order, localFilter, etc.) se leen via ref
 * para que el hook consumidor pueda pasar objetos literales sin memoizar
 * y no provoque loops de re-render. Solo orgId, supabase y table son deps
 * del useEffect/useCallback.
 *
 * Cada hook especifico aporta:
 * - El nombre de la tabla
 * - Configuracion del query (filtros adicionales, order, select string)
 * - Sus propias mutaciones (add/update/delete) con la logica particular
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, getOrgId } from '@/lib/supabase/client'
import { saveLocal, getLocal } from '@/lib/db/indexeddb'
import { syncManager } from '@/lib/sync/syncManager'
import { debounce } from '@/lib/utils/debounce'

export type TableName = 'productos' | 'ventas' | 'movimientos'

export type UseTableSyncOptions<T> = {
  /** Nombre de la tabla en Supabase / IndexedDB */
  table: TableName
  /** Filtros adicionales aplicados al select (ej: { activo: true }) */
  filter?: Record<string, unknown>
  /** Campo y direccion para order (ej: { column: 'fecha', ascending: false }) */
  order?: { column: string; ascending: boolean }
  /** String de select (ej: '*, venta_items(*)'). Default: '*' */
  select?: string
  /** Filtro local sobre data offline (ej: descartar activo=false) */
  localFilter?: (row: T) => boolean
  /** Comparador para ordenar data offline */
  localSort?: (a: T, b: T) => number
}

export type UseTableSyncResult<T> = {
  data: T[]
  loading: boolean
  orgId: string | null
  supabase: SupabaseClient
  refetch: () => Promise<void>
  /** Setters expuestos para que el hook consumidor pueda actualizar UI optimistamente */
  setData: React.Dispatch<React.SetStateAction<T[]>>
  /** Indica si el componente sigue montado — los hooks consumidores no deberian necesitarlo */
  mountedRef: React.MutableRefObject<boolean>
}

export function useTableSync<T extends { id: string }>(opts: UseTableSyncOptions<T>): UseTableSyncResult<T> {
  const { table } = opts

  // Ref para que las options siempre reflejen el ultimo render sin entrar a las deps
  // del useEffect. Esto evita el loop: opts es objeto literal -> nueva identidad cada
  // render -> useCallback se invalida -> useEffect se re-corre -> realtime resubscribe
  // -> fetch -> setData -> re-render -> loop.
  // Actualizamos el ref en un effect (no durante el render) para cumplir
  // react-hooks/refs. Corre despues de cada render, antes de los callbacks async.
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    getOrgId().then(id => { if (id && mountedRef.current) setOrgId(id) })
    return () => { mountedRef.current = false }
  }, [])

  const fetchData = useCallback(async () => {
    if (!orgId) return
    if (mountedRef.current) setLoading(true)

    const { select = '*', filter, order, localFilter, localSort } = optsRef.current

    const fetchOffline = async () => {
      try {
        const local = await getLocal(table, orgId) as T[]
        let result = local
        if (localFilter) result = result.filter(localFilter)
        if (localSort) result = [...result].sort(localSort)
        if (mountedRef.current) setData(result)
      } catch (err) {
        console.warn(`[useTableSync:${table}] error leyendo local:`, err)
      }
    }

    if (!navigator.onLine) {
      await fetchOffline()
      if (mountedRef.current) setLoading(false)
      return
    }

    try {
      let q = supabase.from(table).select(select).eq('org_id', orgId)
      if (filter) {
        for (const [k, v] of Object.entries(filter)) {
          q = q.eq(k, v as never)
        }
      }
      if (order) q = q.order(order.column, { ascending: order.ascending })

      const { data: rows, error } = await q
      if (error) throw error

      const lista = (rows ?? []) as unknown as T[]
      if (mountedRef.current) setData(lista)

      // Persistir en IndexedDB para uso offline (paralelo, errores ignorados)
      await Promise.all(
        lista.map(row => saveLocal(table, row as unknown as { id: string }, 'update').catch(() => {}))
      )
    } catch (err) {
      console.warn(`[useTableSync:${table}] fetch fallo, usando local:`, err)
      await fetchOffline()
    }

    if (mountedRef.current) setLoading(false)
  }, [orgId, supabase, table])

  useEffect(() => {
    if (!orgId) return
    fetchData()

    if (!navigator.onLine) return

    // Realtime debounced: 10 eventos en <500ms → 1 fetch
    const debouncedFetch = debounce(() => { if (mountedRef.current) fetchData() }, 500)

    const channel = supabase.channel(`${table}_${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, debouncedFetch)
      .subscribe()

    // Listener online: await secuencial para evitar race condition
    const onOnline = async () => {
      await syncManager.sync()
      if (mountedRef.current) await fetchData()
    }
    window.addEventListener('online', onOnline)

    return () => {
      debouncedFetch.cancel()
      supabase.removeChannel(channel)
      window.removeEventListener('online', onOnline)
    }
  }, [orgId, fetchData, supabase, table])

  return { data, loading, orgId, supabase, refetch: fetchData, setData, mountedRef }
}
