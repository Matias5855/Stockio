'use client'
import { useState } from 'react'
import { COLORS } from '@/lib/theme'

const PREGUNTAS = [
  {
    q: '¿Necesito tarjeta para empezar la prueba?',
    a: 'Sí, pedimos tarjeta al registrarte pero no cobramos nada durante los primeros 30 días. Si cancelás antes del día 30 no se cobra nada. Después del trial, el cobro es automático mensual vía Mercado Pago.',
  },
  {
    q: '¿Qué planes hay y cuánto cuestan?',
    a: 'Stockio Normal cuesta $14.990/mes (1 usuario). Stockio Premium cuesta $24.990/mes y suma usuarios ilimitados con roles y permisos para equipos.',
  },
  {
    q: '¿Funciona en celular?',
    a: 'Sí, está optimizada para celular y tablet. Podés escanear códigos de barras con la cámara, registrar ventas y consultar stock desde cualquier dispositivo.',
  },
  {
    q: '¿Puedo facturar electrónicamente?',
    a: 'La integración con ARCA/AFIP está preparada — generamos los PDFs con CAE cuando configurás tus credenciales fiscales. Mientras tanto, los comprobantes salen como ticket interno.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Sí. Los datos viven en Supabase (PostgreSQL en la nube) con backups automáticos y políticas RLS que aíslan tu información de cualquier otra empresa.',
  },
  {
    q: '¿Hay soporte si tengo dudas?',
    a: 'Te respondemos por WhatsApp en horario comercial (Chaco, Argentina). Para clientes Premium hay onboarding inicial guiado.',
  },
] as const

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" style={{
      background: '#FFFFFF',
      padding: '80px 24px',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <p style={{
            color: COLORS.primary,
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            margin: 0,
          }}>
            Preguntas frecuentes
          </p>
          <h2 style={{
            color: '#042F2E',
            fontSize: 'clamp(26px, 3.5vw, 36px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: '8px 0 0',
          }}>
            Lo que más nos preguntan
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PREGUNTAS.map((p, i) => {
            const isOpen = open === i
            return (
              <div key={p.q} style={{
                background: isOpen ? '#F0FDFA' : '#FFFFFF',
                border: `1px solid ${isOpen ? '#5EEAD4' : '#CCFBF1'}`,
                borderRadius: 12,
                overflow: 'hidden',
                transition: 'all 0.15s ease',
              }}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '18px 22px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    textAlign: 'left',
                    color: '#042F2E',
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                  }}
                >
                  <span>{p.q}</span>
                  <span style={{
                    color: COLORS.primary,
                    fontSize: 22,
                    fontWeight: 300,
                    transform: isOpen ? 'rotate(45deg)' : 'rotate(0)',
                    transition: 'transform 0.15s',
                    flexShrink: 0,
                  }}>+</span>
                </button>
                {isOpen && (
                  <div style={{
                    padding: '0 22px 20px',
                    color: '#1C4542',
                    fontSize: 14.5,
                    lineHeight: 1.6,
                  }}>
                    {p.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
