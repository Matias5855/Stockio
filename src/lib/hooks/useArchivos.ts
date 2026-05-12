'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Archivo = {
  id: string
  nombre: string
  storage_path: string
  tipo: string
  size_bytes: number | null
  categoria: string
  created_at: string
  url?: string
}

const BUCKET = 'stockflow-archivos'

export function useArchivos() {
  const supabase = useMemo(() => createClient(), [])
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchArchivos = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase.from('archivos').select('*').order('created_at', { ascending: false })
      const lista = (data ?? []) as Archivo[]

      // Generar signed URLs en paralelo (antes era secuencial via Promise.all pero igual ok)
      const withUrls = await Promise.all(
        lista.map(async a => {
          const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 3600)
          return { ...a, url: urlData?.signedUrl }
        })
      )

      if (mountedRef.current) setArchivos(withUrls)
    } catch (err) {
      console.warn('[useArchivos] fetch fallo:', err)
    }
    if (mountedRef.current) setLoading(false)
  }, [supabase])

  useEffect(() => { fetchArchivos() }, [fetchArchivos])

  const uploadArchivo = async (file: File, categoria = 'Sin categoría') => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const tipo = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'img' : ext === 'pdf' ? 'pdf' : 'xls'
    const path = `${Date.now()}_${file.name.replace(/\s/g, '_')}`

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (upErr) throw new Error(upErr.message)

    const { error: dbErr } = await supabase.from('archivos').insert({
      nombre: file.name, storage_path: path, tipo, size_bytes: file.size, categoria,
    })
    if (dbErr) throw new Error(dbErr.message)

    await fetchArchivos()
  }

  const deleteArchivo = async (id: string, path: string) => {
    // Paralelizar borrado de storage y BD
    await Promise.all([
      supabase.storage.from(BUCKET).remove([path]),
      supabase.from('archivos').delete().eq('id', id),
    ])
    await fetchArchivos()
  }

  return { archivos, loading, uploadArchivo, deleteArchivo, refetch: fetchArchivos }
}
