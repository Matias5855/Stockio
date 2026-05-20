import Link from 'next/link'
import { COLORS } from '@/lib/theme'

type Plan = {
  id: 'normal' | 'premium'
  nombre: string
  precio: number
  descripcion: string
  popular: boolean
  features: readonly string[]
}

const PLANES: readonly Plan[] = [
  {
    id: 'normal',
    nombre: 'Stockio Normal',
    precio: 14990,
    descripcion: 'Para negocios que quieren ordenarse',
    popular: false,
    features: [
      '1 usuario',
      'Productos ilimitados',
      'Ventas y facturación',
      'Escáner de código de barras',
      'Cuotas y créditos',
      'Facturación ARCA',
      '10 GB de archivos',
      'Soporte por WhatsApp',
    ],
  },
  {
    id: 'premium',
    nombre: 'Stockio Premium',
    precio: 24990,
    descripcion: 'Para negocios con empleados',
    popular: true,
    features: [
      'Usuarios ilimitados',
      'Stock compartido en tiempo real',
      'Roles y permisos por empleado',
      'Múltiples sucursales',
      'Todo lo del plan Normal',
      '50 GB de archivos',
      'Soporte prioritario',
      'Onboarding guiado',
    ],
  },
] as const

export default function Pricing() {
  return (
    <section id="precios" style={{
      background: '#FFFFFF',
      padding: '80px 24px',
      borderTop: '1px solid #F0FDFA',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={{
            color: COLORS.primary,
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            margin: 0,
          }}>
            Precios simples
          </p>
          <h2 style={{
            color: '#042F2E',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: '8px 0 12px',
          }}>
            Elegí el plan que se adapta a tu negocio
          </h2>
          <p style={{ color: '#1C4542', fontSize: 16, margin: 0 }}>
            <strong style={{ color: COLORS.success }}>30 días gratis</strong> en cualquier plan.
            Sin compromiso, cancelás cuando quieras.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 24,
          maxWidth: 820,
          margin: '0 auto',
        }}>
          {PLANES.map(p => (
            <div key={p.id} style={{
              background: '#FFFFFF',
              border: `2px solid ${p.popular ? COLORS.primary : '#CCFBF1'}`,
              borderRadius: 16,
              padding: 32,
              position: 'relative',
              boxShadow: p.popular ? '0 8px 28px rgba(13,148,136,0.15)' : '0 2px 12px rgba(4,47,46,0.04)',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {p.popular && (
                <div style={{
                  position: 'absolute',
                  top: -14,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: COLORS.primary,
                  color: '#FFFFFF',
                  borderRadius: 100,
                  padding: '5px 16px',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}>
                  ⭐ MÁS POPULAR
                </div>
              )}

              <p style={{
                margin: '0 0 6px',
                fontSize: 13,
                fontWeight: 700,
                color: '#6B7280',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {p.nombre}
              </p>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 38, fontWeight: 800, color: '#042F2E', letterSpacing: '-0.02em' }}>
                  ${p.precio.toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: 14, color: '#6B7280' }}>/mes</span>
              </div>

              <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6B7280' }}>
                {p.descripcion}
              </p>

              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                flex: 1,
              }}>
                {p.features.map(f => (
                  <li key={f} style={{
                    fontSize: 14,
                    color: '#1C4542',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    lineHeight: 1.4,
                  }}>
                    <span style={{
                      color: COLORS.success,
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: 1,
                    }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={`/register?plan=${p.id}`}
                style={{
                  display: 'block',
                  background: p.popular ? COLORS.primary : '#FFFFFF',
                  color: p.popular ? '#FFFFFF' : COLORS.primary,
                  border: `2px solid ${COLORS.primary}`,
                  borderRadius: 10,
                  padding: '13px 18px',
                  textAlign: 'center',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: 15,
                  boxShadow: p.popular ? '0 4px 14px rgba(13,148,136,0.25)' : 'none',
                }}
              >
                Empezar 30 días gratis
              </Link>

              <p style={{
                margin: '12px 0 0',
                fontSize: 12,
                color: '#6B7280',
                textAlign: 'center',
                lineHeight: 1.45,
              }}>
                No se cobra nada hasta el día 31. Cancelás antes sin cargo.
              </p>
            </div>
          ))}
        </div>

        <p style={{
          textAlign: 'center',
          marginTop: 36,
          color: '#6B7280',
          fontSize: 14,
        }}>
          ¿No estás seguro?{' '}
          <Link href="/register" style={{ color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
            Probá Stockio gratis →
          </Link>
        </p>
      </div>
    </section>
  )
}
