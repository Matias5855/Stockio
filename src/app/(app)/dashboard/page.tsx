'use client'
import { useState, useEffect, useMemo } from 'react'
import { useStock } from '@/lib/hooks/useStock'
import { useVentas } from '@/lib/hooks/useVentas'
import { useMovimientos } from '@/lib/hooks/useMovimientos'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { getTheme, COLORS } from '@/lib/theme'

const fmt = (n: number) => '$' + n.toLocaleString('es-AR')
const fmtK = (n: number) => n >= 1_000_000 ? '$' + (n/1_000_000).toFixed(1) + 'M' : n >= 1000 ? '$' + (n/1000).toFixed(0) + 'k' : '$' + n

type MetricCardProps = {
  label: string
  value: string
  bg: string
  border: string
  labelColor: string
  valueColor: string
}

function MetricCard({ label, value, bg, border, labelColor, valueColor }: MetricCardProps) {
  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '16px 18px',
    }}>
      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: valueColor }}>{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { productos } = useStock()
  const { ventas } = useVentas()
  const { resumen } = useMovimientos()

  // Leer tema persistido (sincronizado con el toggle del layout)
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    setIsDark(localStorage.getItem('sf_dark_mode') === '1')
    // Reaccionar a cambios del toggle desde el sidebar
    const handler = () => setIsDark(localStorage.getItem('sf_dark_mode') === '1')
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  const totalVentas = ventas.reduce((a, v) => a + v.total, 0)
  const stockBajo = productos.filter(p => p.cantidad <= p.stock_minimo)
  const pendientes = ventas.filter(v => v.estado === 'pendiente')
  const saldo = resumen.ingresos - resumen.egresos
  const porCobrar = pendientes.reduce((a,v) => a+v.total, 0)

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
    { m: 'Egresos',  v: resumen.egresos },
    { m: 'Saldo',    v: saldo },
  ]

  const cardBase: React.CSSProperties = {
    background: t.card,
    border: `1px solid ${t.borderCard}`,
    borderRadius: 12,
    padding: '20px 22px',
  }

  const chartAxisColor = isDark ? '#5EEAD4' : '#6B7280'

  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Buen día 👋</p>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: t.textMuted }}>Resumen de tu negocio</p>

      {(stockBajo.length > 0 || pendientes.length > 0) && (
        <div style={{
          background: '#FEF3C7',
          border: '1px solid #FCD34D',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 20,
          color: '#92400E',
          fontSize: 13,
          fontWeight: 500,
        }}>
          ⚠ {stockBajo.length > 0 && `${stockBajo.length} producto(s) con stock bajo.`}
          {stockBajo.length > 0 && pendientes.length > 0 && '  ·  '}
          {pendientes.length > 0 && `${pendientes.length} venta(s) pendiente(s) de cobro.`}
        </div>
      )}

      {/* Métricas con paleta especifica */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <MetricCard
          label="Ventas"
          value={fmtK(totalVentas)}
          {...{ bg: COLORS.metric.ventas.bg, border: COLORS.metric.ventas.border, labelColor: COLORS.metric.ventas.label, valueColor: COLORS.metric.ventas.value }}
        />
        <MetricCard
          label="Saldo"
          value={fmtK(saldo)}
          {...{ bg: COLORS.metric.saldo.bg, border: COLORS.metric.saldo.border, labelColor: COLORS.metric.saldo.label, valueColor: COLORS.metric.saldo.value }}
        />
        <MetricCard
          label="Pendiente"
          value={fmtK(porCobrar)}
          {...{ bg: COLORS.metric.pendiente.bg, border: COLORS.metric.pendiente.border, labelColor: COLORS.metric.pendiente.label, valueColor: COLORS.metric.pendiente.value }}
        />
        <MetricCard
          label="Stock"
          value={`${productos.length} items`}
          {...{ bg: COLORS.metric.stock.bg, border: COLORS.metric.stock.border, labelColor: COLORS.metric.stock.label, valueColor: COLORS.metric.stock.value }}
        />
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={cardBase}>
          <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ventas por mes
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ventasPorMes} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(94,234,212,0.12)' : 'rgba(0,0,0,0.06)'} vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: chartAxisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chartAxisColor, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <Tooltip
                formatter={(v) => [fmt(Number(v)), 'Ventas']}
                contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 12 }}
              />
              <Bar dataKey="total" fill={COLORS.primary} radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={cardBase}>
          <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Resumen financiero
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={flujo} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(94,234,212,0.12)' : 'rgba(0,0,0,0.06)'} vertical={false} />
              <XAxis dataKey="m" tick={{ fill: chartAxisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chartAxisColor, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <Tooltip
                formatter={(v) => [fmt(Number(v))]}
                contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 12 }}
              />
              <Bar dataKey="v" radius={[6,6,0,0]} fill={COLORS.secondary} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alertas stock bajo */}
      <div style={cardBase}>
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Alertas de stock bajo
        </p>
        {stockBajo.length === 0
          ? <p style={{ color: t.textMuted, fontSize: 13, margin: 0 }}>✓ Todo el stock está en niveles correctos.</p>
          : stockBajo.map(p => (
            <div key={p.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: `1px solid ${t.borderCard}`,
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.text }}>{p.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: t.textMuted }}>SKU: {p.sku}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: COLORS.danger }}>{p.cantidad} u.</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: t.textMuted }}>mín: {p.stock_minimo}</p>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
