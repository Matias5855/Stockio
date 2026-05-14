'use client'
import { useState, useEffect, useMemo } from 'react'
import { useStock } from '@/lib/hooks/useStock'
import ExportarBtn from '@/components/ExportarBtn'
import { exportarStockExcel, exportarStockPDF } from '@/lib/exportar'
import { getTheme, COLORS } from '@/lib/theme'

const fmt = (n: number) => '$' + n.toLocaleString('es-AR')

type ProductoForm = {
  id?: string
  nombre: string
  sku: string
  cantidad: string
  stock_minimo: string
  precio_venta: string
  costo: string
  talle: string
  color: string
}

type ProductoRow = {
  id: string
  nombre: string
  sku: string
  cantidad: number
  stock_minimo: number
  precio_venta: number
  costo: number
  talle: string | null
  color: string | null
}

const EMPTY_FORM: ProductoForm = {
  nombre: '', sku: '', cantidad: '', stock_minimo: '',
  precio_venta: '', costo: '', talle: '', color: '',
}

export default function StockPage() {
  const { productos, loading, orgId, deleteProducto, refetch } = useStock()
  const [modal, setModal] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<ProductoForm>(EMPTY_FORM)

  // Tema sincronizado con el toggle del layout
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('sf_dark_mode') === '1')
    sync()
    const interval = setInterval(sync, 500)
    return () => clearInterval(interval)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  const filtered = productos.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  )

  const openNew = () => { setForm(EMPTY_FORM); setEditing(null); setModal(true) }
  const openEdit = (p: ProductoRow) => {
    setForm({
      nombre: p.nombre,
      sku: p.sku,
      talle: p.talle ?? '',
      color: p.color ?? '',
      cantidad: String(p.cantidad),
      stock_minimo: String(p.stock_minimo),
      precio_venta: String(p.precio_venta),
      costo: String(p.costo),
    })
    setEditing(p.id)
    setModal(true)
  }

  const save = async () => {
    if (!form.nombre) return

    let currentOrgId = orgId
    if (!currentOrgId) {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return alert('No hay sesión activa')
      const { data: profile } = await supabase
        .from('profiles').select('org_id').eq('id', user.id).single()
      currentOrgId = profile?.org_id ?? null
    }
    if (!currentOrgId) return alert('Error: no se encontró la organización')

    const data = {
      nombre: form.nombre,
      sku: form.sku?.trim() || `SKU-${Date.now()}`,
      talle: form.talle?.trim() || null,
      color: form.color?.trim() || null,
      cantidad: +form.cantidad || 0,
      stock_minimo: +form.stock_minimo || 0,
      precio_venta: +form.precio_venta || 0,
      costo: +form.costo || 0,
      org_id: currentOrgId,
      activo: true,
    }

    try {
      if (navigator.onLine) {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        if (editing) {
          const { error } = await supabase.from('productos').update(data).eq('id', editing)
          if (error) throw new Error(error.message)
        } else {
          const { error } = await supabase.from('productos').insert(data)
          if (error) throw new Error(error.message)
        }
      } else {
        const { saveLocal } = await import('@/lib/db/indexeddb')
        const localData = { ...data, id: editing || crypto.randomUUID() }
        await saveLocal('productos', localData, editing ? 'update' : 'insert')
      }
      setModal(false)
      setForm(EMPTY_FORM)
      await refetch()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error guardando')
    }
  }

  const inp: React.CSSProperties = {
    background: t.card,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: t.text,
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '12px 14px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: isDark ? '#5EEAD4' : '#115E59',
    background: isDark ? 'rgba(94,234,212,0.08)' : '#99F6E4',
    borderBottom: `1px solid ${t.borderMid}`,
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Stock / Inventario</p>
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>
            {productos.length} productos · Valor total: {fmt(productos.reduce((a,p) => a + p.cantidad * p.costo, 0))}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <ExportarBtn
            onExcelClick={() => exportarStockExcel(productos, localStorage.getItem('sf_org_nombre') ?? 'Negocio')}
            onPDFClick={() => exportarStockPDF(productos, localStorage.getItem('sf_org_nombre') ?? 'Negocio')}
          />
          <button onClick={openNew} style={{
            background: COLORS.primary, color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 18px', cursor: 'pointer',
            fontWeight: 700, fontSize: 13,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
          }}>+ Nuevo producto</button>
        </div>
      </div>

      {/* Card con tabla */}
      <div style={{
        background: t.card,
        border: `1px solid ${t.borderCard}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.borderCard}` }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            style={{ ...inp, maxWidth: 320 }}
          />
        </div>

        {loading ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted }}>Cargando…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
            {productos.length === 0 ? 'Sin productos aún. Agregá el primero con "+ Nuevo producto".' : 'Sin resultados para tu búsqueda.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Producto', 'SKU', 'Talle', 'Color', 'Cantidad', 'Mín.', 'Precio', 'Costo', 'Margen', 'Estado', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const margen = p.precio_venta > 0 ? Math.round(((p.precio_venta - p.costo) / p.precio_venta) * 100) : 0
                  const bajo = p.cantidad <= p.stock_minimo
                  const evenRow = i % 2 === 0
                  return (
                    <tr key={p.id} style={{
                      background: evenRow ? t.card : (isDark ? 'rgba(94,234,212,0.04)' : '#F0FDFA'),
                      transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(94,234,212,0.10)' : '#CCFBF1'}
                      onMouseLeave={e => e.currentTarget.style.background = evenRow ? t.card : (isDark ? 'rgba(94,234,212,0.04)' : '#F0FDFA')}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: t.text }}>{p.nombre}</td>
                      <td style={{ padding: '12px 14px', color: t.textMuted, fontFamily: 'monospace', fontSize: 12 }}>{p.sku}</td>
                      <td style={{ padding: '12px 14px', color: t.textMuted }}>{p.talle ?? '—'}</td>
                      <td style={{ padding: '12px 14px', color: t.textMuted }}>{p.color ?? '—'}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: bajo ? COLORS.danger : COLORS.success }}>{p.cantidad}</td>
                      <td style={{ padding: '12px 14px', color: t.textMuted }}>{p.stock_minimo}</td>
                      <td style={{ padding: '12px 14px', color: t.text }}>{fmt(p.precio_venta)}</td>
                      <td style={{ padding: '12px 14px', color: t.textMuted }}>{fmt(p.costo)}</td>
                      <td style={{ padding: '12px 14px', color: margen >= 30 ? COLORS.success : COLORS.warning, fontWeight: 600 }}>{margen}%</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          background: bajo ? COLORS.badge.bajo.bg : COLORS.badge.ok.bg,
                          color: bajo ? COLORS.badge.bajo.text : COLORS.badge.ok.text,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          display: 'inline-block',
                        }}>
                          {bajo ? 'Bajo' : 'OK'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEdit(p)} title="Editar"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: t.textMuted, fontSize: 14, padding: 6, borderRadius: 6,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = COLORS.primary; e.currentTarget.style.background = isDark ? 'rgba(13,148,136,0.15)' : '#CCFBF1' }}
                            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = 'none' }}
                          >✎</button>
                          <button onClick={() => { if (confirm('¿Eliminar este producto?')) deleteProducto(p.id) }} title="Eliminar"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: t.textMuted, fontSize: 18, padding: 6, borderRadius: 6, lineHeight: 1,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = COLORS.danger; e.currentTarget.style.background = '#FFF1F2' }}
                            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = 'none' }}
                          >×</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: 520, maxWidth: '100%',
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 20px', fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>
              {editing ? 'Editar producto' : 'Nuevo producto'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([
                ['nombre','Nombre','text'],
                ['sku','SKU','text'],
                ['talle','Talle','text'],
                ['color','Color','text'],
                ['cantidad','Cantidad','number'],
                ['stock_minimo','Stock mínimo','number'],
                ['precio_venta','Precio venta','number'],
                ['costo','Costo','number'],
              ] as const).map(([k, l, type]) => (
                <div key={k}>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{l}</p>
                  <input
                    type={type}
                    value={form[k]}
                    onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                    style={inp}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={() => setModal(false)} style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '10px 18px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
              }}>Cancelar</button>
              <button onClick={save} style={{
                background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
              }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
