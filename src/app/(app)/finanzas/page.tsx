'use client'
import { useState } from 'react'
import { useMovimientos } from '@/lib/hooks/useMovimientos'

const fmt = (n: number) => '$' + n.toLocaleString('es-AR')
const fmtK = (n: number) => n >= 1000000 ? '$' + (n/1000000).toFixed(1) + 'M' : n >= 1000 ? '$' + (n/1000).toFixed(0) + 'k' : '$' + n

export default function FinanzasPage() {
  const { movimientos, loading, resumen, addMovimiento, deleteMovimiento } = useMovimientos()
  const [modal, setModal] = useState(false)
  const [filtro, setFiltro] = useState('Todos')
  const [form, setForm] = useState({ descripcion: '', tipo: 'ingreso' as 'ingreso' | 'egreso', categoria_nombre: 'Ventas', monto: '' })

  const saldo = resumen.ingresos - resumen.egresos
  const filtered = filtro === 'Todos' ? movimientos : movimientos.filter(m => m.tipo === filtro)

  const save = async () => {
    if (!form.descripcion || !form.monto) return
    try {
      await addMovimiento({ ...form, monto: +form.monto, fecha: new Date().toISOString().split('T')[0] })
      setForm({ descripcion: '', tipo: 'ingreso', categoria_nombre: 'Ventas', monto: '' })
      setModal(false)
    } catch (e: any) { alert(e.message) }
  }

  const inp = { background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 12px', color: '#F0EFF8', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as any }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Finanzas / Caja</p>
          <p style={{ margin: 0, fontSize: 13, color: '#7A7A95' }}>{movimientos.length} movimientos registrados</p>
        </div>
        <button onClick={() => setModal(true)} style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>+ Nuevo movimiento</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Ingresos', value: fmtK(resumen.ingresos), color: '#22C97A' },
          { label: 'Egresos', value: fmtK(resumen.egresos), color: '#E05555' },
          { label: 'Saldo neto', value: fmtK(saldo), color: saldo >= 0 ? '#22C97A' : '#E05555' },
        ].map(m => (
          <div key={m.label} style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 600, color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {['Todos', 'ingreso', 'egreso'].map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{ background: filtro === f ? 'rgba(124,111,224,0.15)' : 'transparent', color: filtro === f ? '#7C6FE0' : '#7A7A95', border: `1px solid ${filtro === f ? 'rgba(124,111,224,0.6)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: filtro === f ? 600 : 400, textTransform: 'capitalize' }}>{f}</button>
          ))}
        </div>
        {loading ? <p style={{ padding: 40, textAlign: 'center', color: '#7A7A95' }}>Cargando...</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Monto', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7A7A95', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <td style={{ padding: '12px 14px', color: '#7A7A95' }}>{m.fecha}</td>
                  <td style={{ padding: '12px 14px' }}>{m.descripcion}</td>
                  <td style={{ padding: '12px 14px' }}><span style={{ background: 'rgba(59,142,234,0.12)', color: '#3B8EEA', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{m.categoria_nombre}</span></td>
                  <td style={{ padding: '12px 14px' }}><span style={{ background: m.tipo === 'ingreso' ? 'rgba(34,201,122,0.12)' : 'rgba(224,85,85,0.12)', color: m.tipo === 'ingreso' ? '#22C97A' : '#E05555', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{m.tipo}</span></td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: m.tipo === 'ingreso' ? '#22C97A' : '#E05555' }}>{m.tipo === 'egreso' ? '−' : '+'}{fmt(m.monto)}</td>
                  <td style={{ padding: '12px 14px' }}><button onClick={() => deleteMovimiento(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E05555', fontSize: 16 }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: 440 }}>
            <p style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600 }}>Nuevo movimiento</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Descripción</p><input value={form.descripcion} onChange={e => setForm(p => ({...p, descripcion: e.target.value}))} style={inp} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Tipo</p>
                  <select value={form.tipo} onChange={e => setForm(p => ({...p, tipo: e.target.value as any}))} style={inp}>
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                  </select>
                </div>
                <div><p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Categoría</p>
                  <select value={form.categoria_nombre} onChange={e => setForm(p => ({...p, categoria_nombre: e.target.value}))} style={inp}>
                    {['Ventas','Compras','Gastos fijos','RRHH','Impuestos','Otro'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Monto ($)</p><input type="number" value={form.monto} onChange={e => setForm(p => ({...p, monto: e.target.value}))} style={inp} /></div>
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