'use client'
import { useState } from 'react'
import { useStock } from '@/lib/hooks/useStock'

const fmt = (n: number) => '$' + n.toLocaleString('es-AR')

export default function StockPage() {
  const { productos, loading, addProducto, updateProducto, deleteProducto } = useStock()
  const [modal, setModal] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const empty = { nombre: '', sku: '', cantidad: '', stock_minimo: '', precio_venta: '', costo: '', categoria_id: '', proveedor_id: '' }
  const [form, setForm] = useState(empty)

  const filtered = productos.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  )

  const openNew = () => { setForm(empty); setEditing(null); setModal(true) }
  const openEdit = (p: any) => {
    setForm({ ...p, cantidad: String(p.cantidad), stock_minimo: String(p.stock_minimo), precio_venta: String(p.precio_venta), costo: String(p.costo) })
    setEditing(p.id); setModal(true)
  }

  const save = async () => {
  if (!form.nombre) return
  // Si no pusieron SKU, generamos uno automático
  const skuFinal = form.sku || `SKU-${Date.now()}`
  const data = {
    nombre: form.nombre,
    sku: skuFinal,
    cantidad: +form.cantidad || 0,
    stock_minimo: +form.stock_minimo || 0,
    precio_venta: +form.precio_venta || 0,
    costo: +form.costo || 0,
    categoria_id: null,
    proveedor_id: null,
  }
  try {
    if (editing) await updateProducto(editing, data)
    else await addProducto(data as any)
    setModal(false)
  } catch (e: any) { alert(e.message) }
}

  const inp = { background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 12px', color: '#F0EFF8', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as any }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Stock / Inventario</p>
          <p style={{ margin: 0, fontSize: 13, color: '#7A7A95' }}>{productos.length} productos · Valor: {fmt(productos.reduce((a,p) => a + p.cantidad * p.costo, 0))}</p>
        </div>
        <button onClick={openNew} style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>+ Nuevo producto</button>
      </div>

      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o SKU…"
            style={{ ...inp, width: 300 }} />
        </div>
        {loading ? <p style={{ padding: 40, textAlign: 'center', color: '#7A7A95' }}>Cargando...</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Producto', 'SKU', 'Cantidad', 'Mín.', 'Precio venta', 'Costo', 'Margen', 'Estado', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7A7A95', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const margen = p.precio_venta > 0 ? Math.round(((p.precio_venta - p.costo) / p.precio_venta) * 100) : 0
                const bajo = p.cantidad <= p.stock_minimo
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 500 }}>{p.nombre}</td>
                    <td style={{ padding: '12px 14px', color: '#7A7A95', fontFamily: 'monospace' }}>{p.sku}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: bajo ? '#E05555' : '#22C97A' }}>{p.cantidad}</td>
                    <td style={{ padding: '12px 14px', color: '#7A7A95' }}>{p.stock_minimo}</td>
                    <td style={{ padding: '12px 14px' }}>{fmt(p.precio_venta)}</td>
                    <td style={{ padding: '12px 14px', color: '#7A7A95' }}>{fmt(p.costo)}</td>
                    <td style={{ padding: '12px 14px', color: margen >= 30 ? '#22C97A' : '#E0A030' }}>{margen}%</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: bajo ? 'rgba(224,85,85,0.12)' : 'rgba(34,201,122,0.12)', color: bajo ? '#E05555' : '#22C97A', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        {bajo ? 'Bajo' : 'OK'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95', fontSize: 13 }}>✎</button>
                        <button onClick={() => deleteProducto(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E05555', fontSize: 16 }}>×</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: 500 }}>
            <p style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600 }}>{editing ? 'Editar producto' : 'Nuevo producto'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['nombre','Nombre','text'],['sku','SKU','text'],['cantidad','Cantidad','number'],['stock_minimo','Stock mínimo','number'],['precio_venta','Precio venta','number'],['costo','Costo','number']].map(([k,l,t]) => (
                <div key={k}>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>{l}</p>
                  <input type={t} value={(form as any)[k]} onChange={e => setForm(p => ({...p, [k]: e.target.value}))} style={inp} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', color: '#7A7A95', fontSize: 13 }}>Cancelar</button>
              <button onClick={save} style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}