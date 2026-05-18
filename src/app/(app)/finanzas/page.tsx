'use client'
import { useState, useEffect, useMemo } from 'react'
import { useMovimientos } from '@/lib/hooks/useMovimientos'
import ExportarBtn from '@/components/ExportarBtn'
import { exportarFinanzasExcel, exportarFinanzasPDF } from '@/lib/exportar'
import { getTheme, COLORS } from '@/lib/theme'

const fmt = (n: number) => '$' + n.toLocaleString('es-AR')
const fmtK = (n: number) => n >= 1_000_000 ? '$' + (n/1_000_000).toFixed(1) + 'M' : n >= 1000 ? '$' + (n/1000).toFixed(0) + 'k' : '$' + n

export default function FinanzasPage() {
  const { movimientos, loading, resumen, addMovimiento, deleteMovimiento } = useMovimientos()
  const [modal, setModal] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [form, setForm] = useState({ descripcion: '', tipo: 'ingreso' as 'ingreso' | 'egreso', categoria_nombre: 'Ventas', monto: '' })

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('stk_dark_mode') === '1')
    sync()
    const interval = setInterval(sync, 500)
    return () => clearInterval(interval)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  const saldo = resumen.ingresos - resumen.egresos
  const filtered = filtro === 'todos' ? movimientos : movimientos.filter(m => m.tipo === filtro)

  const save = async () => {
    if (!form.descripcion || !form.monto) return
    try {
      await addMovimiento({ ...form, monto: +form.monto, fecha: new Date().toISOString().split('T')[0] })
      setForm({ descripcion: '', tipo: 'ingreso', categoria_nombre: 'Ventas', monto: '' })
      setModal(false)
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  const inp: React.CSSProperties = {
    background: t.card, border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '10px 12px', color: t.text, fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '12px 14px',
    fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    color: isDark ? '#5EEAD4' : '#115E59',
    background: isDark ? 'rgba(94,234,212,0.08)' : '#99F6E4',
    borderBottom: `1px solid ${t.borderMid}`,
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Finanzas / Caja</p>
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>{movimientos.length} movimientos registrados</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <ExportarBtn
            onExcelClick={() => exportarFinanzasExcel(filtered, localStorage.getItem('stk_org_nombre') ?? 'Negocio')}
            onPDFClick={() => exportarFinanzasPDF(filtered, localStorage.getItem('stk_org_nombre') ?? 'Negocio')}
          />
          <button onClick={() => setModal(true)} style={{
            background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
          }}>+ Nuevo movimiento</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Ingresos',   value: fmtK(resumen.ingresos), palette: COLORS.metric.ventas },
          { label: 'Egresos',    value: fmtK(resumen.egresos),  palette: COLORS.metric.pendiente },
          { label: 'Saldo neto', value: fmtK(saldo),            palette: saldo >= 0 ? COLORS.metric.ventas : COLORS.metric.pendiente },
        ].map(m => (
          <div key={m.label} style={{
            background: m.palette.bg, border: `1px solid ${m.palette.border}`,
            borderRadius: 12, padding: '16px 18px',
          }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: m.palette.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {m.label}
            </p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: m.palette.value }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderBottom: `1px solid ${t.borderCard}`, flexWrap: 'wrap' }}>
          {['todos', 'ingreso', 'egreso'].map(f => {
            const active = filtro === f
            return (
              <button key={f} onClick={() => setFiltro(f)} style={{
                background: active ? COLORS.primary : 'transparent',
                color: active ? '#fff' : t.textMuted,
                border: `1px solid ${active ? COLORS.primary : t.border}`,
                borderRadius: 7, padding: '6px 14px', fontSize: 12,
                cursor: 'pointer', fontWeight: active ? 700 : 500,
                textTransform: 'capitalize',
              }}>{f}</button>
            )
          })}
        </div>
        {loading ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted }}>Cargando…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
            {movimientos.length === 0 ? 'Sin movimientos. Empezá con "+ Nuevo movimiento".' : 'Sin resultados para este filtro.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Monto', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const evenRow = i % 2 === 0
                  const esIngreso = m.tipo === 'ingreso'
                  return (
                    <tr key={m.id} style={{
                      background: evenRow ? t.card : (isDark ? 'rgba(94,234,212,0.04)' : '#F0FDFA'),
                    }}>
                      <td style={{ padding: '12px 14px', color: t.textMuted }}>{m.fecha}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 500, color: t.text }}>{m.descripcion}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          background: '#DBEAFE', color: '#1E40AF',
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        }}>{m.categoria_nombre}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          background: esIngreso ? COLORS.badge.ok.bg : COLORS.badge.error.bg,
                          color: esIngreso ? COLORS.badge.ok.text : COLORS.badge.error.text,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          textTransform: 'capitalize',
                        }}>{m.tipo}</span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 800, color: esIngreso ? COLORS.success : COLORS.danger }}>
                        {esIngreso ? '+' : '−'}{fmt(m.monto)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button onClick={() => { if (confirm('¿Eliminar este movimiento?')) deleteMovimiento(m.id) }} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: t.textMuted, fontSize: 18, padding: 6, borderRadius: 6, lineHeight: 1,
                        }}
                          onMouseEnter={e => { e.currentTarget.style.color = COLORS.danger; e.currentTarget.style.background = '#FFF1F2' }}
                          onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = 'none' }}
                        >×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: 460, maxWidth: '100%',
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 20px', fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Nuevo movimiento</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Descripción</p>
                <input value={form.descripcion} onChange={e => setForm(p => ({...p, descripcion: e.target.value}))} style={inp} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Tipo</p>
                  <select value={form.tipo} onChange={e => setForm(p => ({...p, tipo: e.target.value as 'ingreso' | 'egreso'}))} style={inp}>
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                  </select>
                </div>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Categoría</p>
                  <select value={form.categoria_nombre} onChange={e => setForm(p => ({...p, categoria_nombre: e.target.value}))} style={inp}>
                    {['Ventas','Compras','Gastos fijos','RRHH','Impuestos','Otro'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Monto ($)</p>
                <input type="number" value={form.monto} onChange={e => setForm(p => ({...p, monto: e.target.value}))} style={inp} />
              </div>
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
