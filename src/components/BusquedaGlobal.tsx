'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTheme } from '@/lib/theme'

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
  const [isDark, setIsDark] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincronizar con el toggle dark/light del layout
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('stk_dark_mode') === '1')
    sync()
    const onStorage = () => sync()
    window.addEventListener('storage', onStorage)
    const interval = setInterval(sync, 500) // pollea por si cambia desde el mismo tab
    return () => { window.removeEventListener('storage', onStorage); clearInterval(interval) }
  }, [])

  const t = useMemo(() => getTheme(isDark), [isDark])

  // Atajo Ctrl+K
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
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => buscar(query), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const buscar = async (q: string) => {
    setLoading(true)
    const orgId = localStorage.getItem('stk_org_id')
    if (!orgId) { setLoading(false); return }

    const term = `%${q}%`
    const res: Resultado[] = []

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

  // Badges por tipo (sutiles, theme-aware)
  const badgeBg: Record<string, string> = {
    producto: isDark ? 'rgba(94,234,212,0.15)' : '#CCFBF1',
    venta: isDark ? 'rgba(22,163,74,0.18)' : '#DCFCE7',
    movimiento: isDark ? 'rgba(37,99,235,0.18)' : '#DBEAFE',
  }

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 12, color: t.textMuted, fontSize: 15, pointerEvents: 'none' }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar productos, ventas, clientes… (Ctrl+K)"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#99F6E4'}`,
            borderRadius: 10,
            padding: '10px 40px 10px 38px',
            color: t.text,
            fontSize: 13,
            outline: 'none',
            transition: 'border-color 0.12s, box-shadow 0.12s',
          }}
          onFocusCapture={e => {
            e.currentTarget.style.borderColor = '#0D9488'
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.15)'
          }}
          onBlurCapture={e => {
            e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#99F6E4'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResultados([]) }}
            style={{
              position: 'absolute', right: 10, background: 'none', border: 'none',
              cursor: 'pointer', color: t.textMuted, fontSize: 18, padding: 4,
              lineHeight: 1,
            }}
            aria-label="Limpiar"
          >
            ×
          </button>
        )}
      </div>

      {open && query.length > 0 && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 100,
            background: t.card,
            border: `1px solid ${t.borderCard}`,
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: isDark ? '0 12px 48px rgba(0,0,0,0.5)' : '0 12px 32px rgba(4,47,46,0.12)',
          }}>
            {loading && (
              <p style={{ padding: '14px 16px', margin: 0, color: t.textMuted, fontSize: 13 }}>Buscando…</p>
            )}

            {!loading && resultados.length === 0 && (
              <p style={{ padding: '20px 16px', margin: 0, color: t.textMuted, fontSize: 13, textAlign: 'center' }}>
                Sin resultados para &quot;{query}&quot;
              </p>
            )}

            {!loading && resultados.length > 0 && resultados.map((r, i) => (
              <button
                key={r.id + i}
                onClick={r.accion}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', background: 'none', border: 'none',
                  borderBottom: `1px solid ${t.borderCard}`,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : '#F0FDFA'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: badgeBg[r.tipo] ?? (isDark ? 'rgba(255,255,255,0.08)' : '#F0FDFA'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>
                  {r.icono}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.titulo}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: t.textMuted }}>{r.subtitulo}</p>
                </div>
                <span style={{
                  fontSize: 11, color: t.textMuted,
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#F0FDFA',
                  padding: '2px 8px', borderRadius: 6, flexShrink: 0,
                }}>
                  {r.tipo}
                </span>
              </button>
            ))}

            <div style={{ padding: '8px 16px', borderTop: `1px solid ${t.borderCard}`, background: isDark ? 'transparent' : '#F0FDFA' }}>
              <p style={{ margin: 0, fontSize: 11, color: t.textMuted }}>
                ↵ para ir · Esc para cerrar · Ctrl+K para abrir
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
