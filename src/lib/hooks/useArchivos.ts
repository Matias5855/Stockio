'use client'
import { useEffect, useState, useCallback } from 'react'
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
  const supabase = createClient()
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('archivos').select('*').order('created_at', { ascending: false })
    const withUrls = await Promise.all(
      (data ?? []).map(async (a: any) => {
        const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 3600)
        return { ...a, url: urlData?.signedUrl }
      })
    )
    setArchivos(withUrls)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const uploadArchivo = async (file: File, categoria = 'Sin categoría') => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const tipo = ['jpg','jpeg','png','gif','webp'].includes(ext) ? 'img' : ext === 'pdf' ? 'pdf' : 'xls'
    const path = `${Date.now()}_${file.name.replace(/\s/g, '_')}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (upErr) throw new Error(upErr.message)
    const { error: dbErr } = await supabase.from('archivos').insert({ nombre: file.name, storage_path: path, tipo, size_bytes: file.size, categoria })
    if (dbErr) throw new Error(dbErr.message)
    fetch()
  }

  const deleteArchivo = async (id: string, path: string) => {
    await supabase.storage.from(BUCKET).remove([path])
    await supabase.from('archivos').delete().eq('id', id)
    fetch()
  }

  return { archivos, loading, uploadArchivo, deleteArchivo, refetch: fetch }
}