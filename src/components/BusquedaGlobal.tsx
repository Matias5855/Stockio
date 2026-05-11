'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Resultado = {
  id: string
  tipo: 'producto' | 'venta' | 'cliente' | 'movimiento'
  titulo: string
  subtitulo: string
  icono: string
  accion: () => void
}

interface Props {
  onNavegar: (pagina: string) => void
}

export default function BusquedaGlobal({ onNavegar }: Props) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<any>(null)

  // Atajo de teclado Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResultados([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => buscar(query), 300)
    return () => clearTimeout(timerRef.current)
  }, [query])

  const buscar = async (q: string) => {
    setLoading(true)
    const orgId = localStorage.getItem('sf_org_id')
    if (!orgId) return

    const term = `%${q}%`
    const res: Resultado[] = []

    // Buscar productos
    const { data: productos } = await supabase
      .from('productos').select('id, nombre, sku, cantidad, talle')
      .eq('org_id', orgId).eq('activo', true)
      .or(`nombre.ilike.${term},sku.ilike.${term},talle.ilike.${term}`)
      .limit(4)

    productos?.forEach(p => res.push({
      id: p.id, tipo: 'producto',
      titulo: p.nombre,
      subtitulo: `SKU: ${p.sku}${p.talle ? ` · Talle: ${p.talle}` : ''} · Stock: ${p.cantidad}`,
      icono: '📦',
      accion: () => { onNavegar('stock'); setOpen(false); setQuery('') },
    }))

    // Buscar ventas
    const { data: ventas } = await supabase
      .from('ventas').select('id, nro_factura, cliente_nombre, total, fecha')
      .eq('org_id', orgId)
      .or(`nro_factura.ilike.${term},cliente_nombre.ilike.${term}`)
      .limit(4)

    ventas?.forEach(v => res.push({
      id: v.id, tipo: 'venta',
      titulo: `${v.nro_factura} — ${v.cliente_nombre ?? 'Sin cliente'}`,
      subtitulo: `$${v.total.toLocaleString('es-AR')} · ${v.fecha}`,
      icono: '🧾',
      accion: () => { onNavegar('ventas'); setOpen(false); setQuery('') },
    }))

    // Buscar movimientos
    const { data: movimientos } = await supabase
      .from('movimientos').select('id, descripcion, monto, tipo')
      .eq('org_id', orgId)
      .ilike('descripcion', term)
      .limit(3)

    movimientos?.forEach(m => res.push({
      id: m.id, tipo: 'movimiento',
      titulo: m.descripcion,
      subtitulo: `${m.tipo === 'ingreso' ? '+' : '-'}$${m.monto.toLocaleString('es-AR')}`,
      icono: m.tipo === 'ingreso' ? '💰' : '💸',
      accion: () => { onNavegar('finanzas'); setOpen(false); setQuery('') },
    }))

    setResultados(res)
    setLoading(false)
  }

  const colores: Record<string, string> = {
    producto: 'rgba(124,111,224,0.15)',
    venta: 'rgba(34,201,122,0.12)',
    movimiento: 'rgba(59,142,234,0.12)',
  }

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
      {/* Input de búsqueda */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 12, color: '#7A7A95', fontSize: 16 }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar productos, ventas, clientes… (Ctrl+K)"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '9px 40px 9px 38px',
            color: '#F0EFF8', fontSize: 13, outline: 'none',
          }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResultados([]) }}
            style={{ position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95', fontSize: 16 }}>
            ×
          </button>
        )}
      </div>

      {/* Resultados */}
      {open && (query.length > 0) && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 100,
            background: '#17171C', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
          }}>
            {loading && (
              <p style={{ padding: '14px 16px', margin: 0, color: '#7A7A95', fontSize: 13 }}>Buscando...</p>
            )}

            {!loading && resultados.length === 0 && (
              <p style={{ padding: '20px 16px', margin: 0, color: '#7A7A95', fontSize: 13, textAlign: 'center' }}>
                Sin resultados para "{query}"
              </p>
            )}

            {!loading && resultados.length > 0 && resultados.map((r, i) => (
              <button key={r.id + i} onClick={r.accion}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', background: 'none', border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: colores[r.tipo] ?? 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>
                  {r.icono}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#F0EFF8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A7A95' }}>{r.subtitulo}</p>
                </div>
                <span style={{ fontSize: 11, color: '#7A7A95', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6, flexShrink: 0 }}>
                  {r.tipo}
                </span>
              </button>
            ))}

            <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#4A4A62' }}>
                ↵ para ir · Esc para cerrar · Ctrl+K para abrir
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}