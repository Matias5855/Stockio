import Link from 'next/link'
import { COLORS } from '@/lib/theme'

export default function Hero() {
  return (
    <section style={{
      background: 'linear-gradient(180deg, #F0FDFA 0%, #FFFFFF 100%)',
      padding: '80px 24px 64px',
    }}>
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        textAlign: 'center',
      }}>
        {/* Badge superior */}
        <div style={{
          display: 'inline-block',
          background: '#CCFBF1',
          color: '#115E59',
          fontSize: 13,
          fontWeight: 600,
          padding: '6px 14px',
          borderRadius: 999,
          marginBottom: 24,
        }}>
          ✦ Pensado para PyMEs argentinas
        </div>

        <h1 style={{
          color: '#042F2E',
          fontSize: 'clamp(32px, 5vw, 56px)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          margin: '0 0 20px',
          maxWidth: 820,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          Gestioná tu PyME desde <span style={{ color: COLORS.primary }}>un solo lugar</span>
        </h1>

        <p style={{
          color: '#1C4542',
          fontSize: 'clamp(16px, 2vw, 19px)',
          lineHeight: 1.55,
          maxWidth: 640,
          margin: '0 auto 36px',
        }}>
          Stock, ventas, finanzas y facturas. Hecho para comercios de Resistencia
          y todo el Chaco — sin complicaciones técnicas.
        </p>

        {/* CTAs */}
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: 28,
        }}>
          <Link href="/register" style={{
            background: COLORS.primary,
            color: '#fff',
            padding: '14px 28px',
            borderRadius: 10,
            textDecoration: 'none',
            fontSize: 16,
            fontWeight: 700,
            boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
          }}>
            Probar 30 días gratis →
          </Link>
          <Link href="/login" style={{
            background: '#FFFFFF',
            color: '#1C4542',
            padding: '14px 28px',
            borderRadius: 10,
            textDecoration: 'none',
            fontSize: 16,
            fontWeight: 600,
            border: '1px solid #99F6E4',
          }}>
            Ya tengo cuenta
          </Link>
        </div>

        <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
          Sin tarjeta los primeros 30 días · Cancelás cuando quieras
        </p>

        {/* Mockup placeholder — bloque visual del dashboard */}
        <div style={{
          marginTop: 64,
          maxWidth: 980,
          marginLeft: 'auto',
          marginRight: 'auto',
          background: '#FFFFFF',
          border: '1px solid #CCFBF1',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(4,47,46,0.12)',
          overflow: 'hidden',
        }}>
          {/* Topbar simulada */}
          <div style={{
            background: '#042F2E',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#DC2626' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#D97706' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16A34A' }} />
            <span style={{ color: '#5EEAD4', fontSize: 12, marginLeft: 12 }}>StockFlow · Dashboard</span>
          </div>

          {/* Cuerpo simulado: 4 cards */}
          <div style={{
            padding: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
            background: '#F0FDFA',
          }}>
            <MetricMock label="Ventas hoy" value="$184.500" palette={COLORS.metric.ventas} />
            <MetricMock label="Saldo en caja" value="$92.300" palette={COLORS.metric.saldo} />
            <MetricMock label="Cuotas pendientes" value="3" palette={COLORS.metric.pendiente} />
            <MetricMock label="Stock bajo" value="5 items" palette={COLORS.metric.stock} />
          </div>
        </div>
      </div>
    </section>
  )
}

type MetricPalette = { bg: string; border: string; label: string; value: string }

function MetricMock({ label, value, palette }: { label: string; value: string; palette: MetricPalette }) {
  return (
    <div style={{
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      textAlign: 'left',
    }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: palette.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800, color: palette.value }}>
        {value}
      </p>
    </div>
  )
}
