import Link from 'next/link'
import { COLORS } from '@/lib/theme'

const BENEFICIOS = [
  'Sin instalaciones — entrás desde el navegador o el celular',
  'Soporte por WhatsApp en español',
  'Backups automáticos en la nube',
  'Multiusuario con permisos por rol (plan Premium)',
  'Facturación electrónica preparada para AFIP',
  'Datos exportables a Excel cuando quieras',
] as const

export default function Beneficios() {
  return (
    <section id="beneficios" style={{
      background: '#F0FDFA',
      padding: '80px 24px',
    }}>
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 56,
        alignItems: 'center',
      }}>
        {/* Texto */}
        <div>
          <p style={{
            color: COLORS.primary,
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            margin: 0,
          }}>
            Por qué StockFlow
          </p>
          <h2 style={{
            color: '#042F2E',
            fontSize: 'clamp(26px, 3.5vw, 36px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: '8px 0 20px',
          }}>
            Pensado para comercios reales
          </h2>
          <p style={{
            color: '#1C4542',
            fontSize: 16,
            lineHeight: 1.6,
            margin: '0 0 28px',
          }}>
            No es un Excel disfrazado. Es una herramienta hecha desde cero
            por gente que entiende cómo trabaja una PyME argentina —
            con cuotas, escáner, offline y todo lo que falta en los sistemas grandes.
          </p>

          <Link href="/register" style={{
            display: 'inline-block',
            background: COLORS.primary,
            color: '#fff',
            padding: '12px 24px',
            borderRadius: 10,
            textDecoration: 'none',
            fontSize: 15,
            fontWeight: 700,
            boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
          }}>
            Empezar prueba gratis
          </Link>
        </div>

        {/* Lista de checks */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #CCFBF1',
          borderRadius: 16,
          padding: 32,
        }}>
          {BENEFICIOS.map(b => (
            <div key={b} style={{
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
              padding: '10px 0',
            }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: COLORS.success,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
                marginTop: 1,
              }}>
                ✓
              </div>
              <p style={{
                color: '#1C4542',
                fontSize: 15,
                lineHeight: 1.5,
                margin: 0,
              }}>
                {b}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
