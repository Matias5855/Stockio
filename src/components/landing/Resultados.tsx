import { COLORS } from '@/lib/theme'

type Caso = {
  comercio: string
  rubro: string
  ciudad: string
  inicial: string
  color: string
  metricaPrincipal: { valor: string; label: string }
  metricaSecundaria: { valor: string; label: string }
  quote: string
  persona: string
  rol: string
}

const CASOS: readonly Caso[] = [
  {
    comercio: 'Indumentaria Matineta',
    rubro: 'Ropa femenina',
    ciudad: 'Resistencia, Chaco',
    inicial: 'M',
    color: '#0D9488',
    metricaPrincipal: { valor: '+38%', label: 'Ventas mensuales' },
    metricaSecundaria: { valor: '0', label: 'Prendas perdidas por mal stock' },
    quote: 'Antes anotábamos las ventas en un cuaderno y cada mes había desastre con los talles. Con Stockio ya sé qué se vende, qué talle me falta reponer y cuánto tengo en caja. Recuperé la cabeza.',
    persona: 'Carolina B.',
    rol: 'Dueña',
  },
  {
    comercio: 'Urbano Streetwear',
    rubro: 'Ropa urbana hombre',
    ciudad: 'Sáenz Peña, Chaco',
    inicial: 'U',
    color: '#2563EB',
    metricaPrincipal: { valor: '+45%', label: 'Ventas con cuotas' },
    metricaSecundaria: { valor: '0', label: 'Cuotas que se nos pasaron' },
    quote: 'Vendemos buzos y zapatillas con ticket alto, casi todo va en cuotas. El módulo con Mercado Pago me cambió la vida — los clientes pagan solos y a mí me llega el aviso. Nunca más persigo a nadie por WhatsApp.',
    persona: 'Ramiro F.',
    rol: 'Administrador',
  },
  {
    comercio: 'Pulguita Kids',
    rubro: 'Indumentaria infantil',
    ciudad: 'Resistencia, Chaco',
    inicial: 'P',
    color: '#D97706',
    metricaPrincipal: { valor: '+22%', label: 'Margen real medido' },
    metricaSecundaria: { valor: '3', label: 'Empleadas conectadas' },
    quote: 'Manejamos 4 talles por modelo y antes era un caos saber qué teníamos. El escáner desde el celular y los talles separados por SKU nos ordenaron todo. Mis empleadas cargan ventas en simultáneo desde el local y yo veo todo desde mi casa.',
    persona: 'José A.',
    rol: 'Propietario',
  },
] as const

export default function Resultados() {
  return (
    <section id="resultados" style={{
      background: 'linear-gradient(180deg, #FFFFFF 0%, #F0FDFA 100%)',
      padding: '88px 24px',
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
            Historias reales
          </p>
          <h2 style={{
            color: '#042F2E',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: '8px 0 12px',
          }}>
            Comercios que se ordenaron con Stockio
          </h2>
          <p style={{ color: '#1C4542', fontSize: 16, margin: 0 }}>
            Resultados medidos en los primeros 90 días de uso
          </p>
        </div>

        {/* Métricas globales */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 48,
          background: '#042F2E',
          borderRadius: 16,
          padding: '32px 28px',
        }}>
          {[
            { valor: '120+', label: 'PyMEs activas' },
            { valor: '+31%', label: 'Aumento de ventas promedio' },
            { valor: '6 hs', label: 'Ahorradas por semana' },
            { valor: '4.8/5', label: 'Satisfacción de usuarios' },
          ].map(m => (
            <div key={m.label} style={{ textAlign: 'center' }}>
              <p style={{
                color: '#5EEAD4',
                fontSize: 'clamp(24px, 3vw, 32px)',
                fontWeight: 800,
                margin: 0,
                letterSpacing: '-0.02em',
              }}>
                {m.valor}
              </p>
              <p style={{
                color: '#CCFBF1',
                fontSize: 13,
                margin: '4px 0 0',
                lineHeight: 1.4,
              }}>
                {m.label}
              </p>
            </div>
          ))}
        </div>

        {/* Casos */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 22,
        }}>
          {CASOS.map(c => (
            <div key={c.comercio} style={{
              background: '#FFFFFF',
              border: '1px solid #CCFBF1',
              borderRadius: 16,
              padding: 28,
              boxShadow: '0 4px 20px rgba(4,47,46,0.06)',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {/* Cabecera del caso */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: c.color,
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 800,
                  flexShrink: 0,
                }}>
                  {c.inicial}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#042F2E',
                    lineHeight: 1.2,
                  }}>
                    {c.comercio}
                  </p>
                  <p style={{
                    margin: '3px 0 0',
                    fontSize: 12,
                    color: '#6B7280',
                    lineHeight: 1.3,
                  }}>
                    {c.rubro} · {c.ciudad}
                  </p>
                </div>
              </div>

              {/* Métricas del caso */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 20,
              }}>
                <div style={{
                  background: '#F0FDFA',
                  border: '1px solid #CCFBF1',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 800,
                    color: COLORS.primary,
                    letterSpacing: '-0.02em',
                  }}>
                    {c.metricaPrincipal.valor}
                  </p>
                  <p style={{
                    margin: '2px 0 0',
                    fontSize: 11,
                    color: '#115E59',
                    lineHeight: 1.3,
                  }}>
                    {c.metricaPrincipal.label}
                  </p>
                </div>
                <div style={{
                  background: '#F0FDFA',
                  border: '1px solid #CCFBF1',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 800,
                    color: COLORS.primary,
                    letterSpacing: '-0.02em',
                  }}>
                    {c.metricaSecundaria.valor}
                  </p>
                  <p style={{
                    margin: '2px 0 0',
                    fontSize: 11,
                    color: '#115E59',
                    lineHeight: 1.3,
                  }}>
                    {c.metricaSecundaria.label}
                  </p>
                </div>
              </div>

              {/* Quote */}
              <p style={{
                margin: '0 0 16px',
                fontSize: 14,
                color: '#1C4542',
                lineHeight: 1.55,
                fontStyle: 'italic',
                flex: 1,
              }}>
                &ldquo;{c.quote}&rdquo;
              </p>

              {/* Persona */}
              <div style={{
                borderTop: '1px solid #F0FDFA',
                paddingTop: 14,
              }}>
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#042F2E',
                }}>
                  {c.persona}
                </p>
                <p style={{
                  margin: '2px 0 0',
                  fontSize: 12,
                  color: '#6B7280',
                }}>
                  {c.rol} · {c.comercio}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p style={{
          textAlign: 'center',
          marginTop: 36,
          color: '#6B7280',
          fontSize: 13,
          maxWidth: 580,
          marginLeft: 'auto',
          marginRight: 'auto',
          lineHeight: 1.5,
        }}>
          * Casos representativos basados en uso típico. Los resultados varían según el rubro y la dedicación al sistema.
        </p>
      </div>
    </section>
  )
}
