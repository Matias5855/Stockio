import { COLORS } from '@/lib/theme'

const FEATURES = [
  {
    icon: '▦',
    title: 'Control de inventario',
    desc: 'Stock con SKU, talle, color y proveedor. Alertas automáticas de stock bajo.',
  },
  {
    icon: '↗',
    title: 'Ventas y facturación',
    desc: 'Registrá ventas, generá facturas PDF y enviá por email a tus clientes.',
  },
  {
    icon: '$',
    title: 'Flujo de caja',
    desc: 'Ingresos y egresos en un solo lugar. Saldo real del negocio en tiempo real.',
  },
  {
    icon: '⊟',
    title: 'Cuotas y planes de pago',
    desc: 'Ofrecé pagos en cuotas con Mercado Pago. Cobro automático y recordatorios.',
  },
  {
    icon: '📷',
    title: 'Escáner de códigos',
    desc: 'Cargá productos y registrá ventas escaneando con la cámara del celular.',
  },
  {
    icon: '☁',
    title: 'Funciona offline',
    desc: 'Seguí trabajando sin internet. Los cambios se sincronizan al reconectarte.',
  },
] as const

export default function Features() {
  return (
    <section id="features" style={{
      background: '#FFFFFF',
      padding: '80px 24px',
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
            Todo lo que necesitás
          </p>
          <h2 style={{
            color: '#042F2E',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: '8px 0 0',
          }}>
            Una sola app para todo el negocio
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: '#F0FDFA',
              border: '1px solid #CCFBF1',
              borderRadius: 14,
              padding: 28,
            }}>
              <div style={{
                width: 44,
                height: 44,
                background: '#CCFBF1',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: COLORS.primary,
                marginBottom: 16,
              }}>
                {f.icon}
              </div>
              <h3 style={{
                color: '#042F2E',
                fontSize: 17,
                fontWeight: 700,
                margin: '0 0 6px',
              }}>
                {f.title}
              </h3>
              <p style={{
                color: '#1C4542',
                fontSize: 14,
                lineHeight: 1.55,
                margin: 0,
              }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
