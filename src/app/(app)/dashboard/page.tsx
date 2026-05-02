'use client'
import { useStock } from '@/lib/hooks/useStock'
import { useVentas } from '@/lib/hooks/useVentas'
import { useMovimientos } from '@/lib/hooks/useMovimientos'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'

const fmt = (n: number) => '$' + n.toLocaleString('es-AR')
const fmtK = (n: number) => n >= 1000000 ? '$' + (n/1000000).toFixed(1) + 'M' : n >= 1000 ? '$' + (n/1000).toFixed(0) + 'k' : '$' + n

const PIE_COLORS = ['#7C6FE0', '#3B8EEA', '#22C97A', '#E0A030']

export default function DashboardPage() {
  const { productos } = useStock()
  const { ventas } = useVentas()
  const { movimientos, resumen } = useMovimientos()

  const totalVentas = ventas.reduce((a, v) => a + v.total, 0)
  const stockBajo = productos.filter(p => p.cantidad <= p.stock_minimo)
  const pendientes = ventas.filter(v => v.estado === 'pendiente')
  const saldo = resumen.ingresos - resumen.egresos

  // Datos para gráficos
  // Generar últimos 4 meses dinámicamente
  const ventasPorMes = Array.from({ length: 4 }, (_, i) => {
    const fecha = new Date()
    fecha.setMonth(fecha.getMonth() - (3 - i))
    const mes = fecha.toLocaleString('es-AR', { month: 'short' })
    const mesNum = String(fecha.getMonth() + 1).padStart(2, '0')
    const anio = fecha.getFullYear()
    const total = ventas
      .filter(v => v.fecha?.startsWith(`${anio}-${mesNum}`))
      .reduce((a, v) => a + v.total, 0)
    return { mes, total }
  })

  const flujo = [
    { m: 'Ingresos', v: resumen.ingresos },
    { m: 'Egresos', v: resumen.egresos },
    { m: 'Saldo', v: saldo },
  ]

  const card = { background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '18px 20px' }

  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Buen día 👋</p>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#7A7A95' }}>Resumen de tu negocio</p>

      {(stockBajo.length > 0 || pendientes.length > 0) && (
        <div style={{ background: 'rgba(224,160,48,0.12)', border: '1px solid rgba(224,160,48,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#E0A030', fontSize: 13, fontWeight: 500 }}>
          ⚠ {stockBajo.length > 0 && `${stockBajo.length} producto(s) con stock bajo.`}
          {stockBajo.length > 0 && pendientes.length > 0 && '  ·  '}
          {pendientes.length > 0 && `${pendientes.length} venta(s) pendiente(s) de cobro.`}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Ventas totales', value: fmtK(totalVentas), color: '#22C97A' },
          { label: 'Saldo en caja', value: fmtK(saldo), color: saldo >= 0 ? '#22C97A' : '#E05555' },
          { label: 'Productos activos', value: String(productos.length), color: '#F0EFF8' },
          { label: 'Por cobrar', value: fmtK(pendientes.reduce((a,v) => a+v.total, 0)), color: '#3B8EEA' },
        ].map(m => (
          <div key={m.label} style={card}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7A7A95', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 600, color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 600, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ventas por mes</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={ventasPorMes} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: '#7A7A95', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#7A7A95', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => [fmt(v), 'Ventas']} contentStyle={{ background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F0EFF8', fontSize: 12 }} />
              <Bar dataKey="total" fill="#7C6FE0" radius={[5,5,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 600, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resumen financiero</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={flujo} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="m" tick={{ fill: '#7A7A95', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#7A7A95', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => [fmt(v)]} contentStyle={{ background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F0EFF8', fontSize: 12 }} />
              <Bar dataKey="v" radius={[5,5,0,0]} fill="#3B8EEA" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Alertas de stock bajo</p>
        {stockBajo.length === 0
          ? <p style={{ color: '#7A7A95', fontSize: 13, margin: 0 }}>✓ Todo el stock está en niveles correctos.</p>
          : stockBajo.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{p.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A7A95' }}>SKU: {p.sku}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#E05555' }}>{p.cantidad} u.</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A7A95' }}>mín: {p.stock_minimo}</p>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}