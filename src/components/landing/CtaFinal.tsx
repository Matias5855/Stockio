import Link from 'next/link'
import { COLORS } from '@/lib/theme'

export default function CtaFinal() {
  return (
    <section style={{
      background: COLORS.primary,
      padding: '72px 24px',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2 style={{
          color: '#FFFFFF',
          fontSize: 'clamp(26px, 4vw, 38px)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '0 0 14px',
        }}>
          Probalo gratis 30 días
        </h2>
        <p style={{
          color: '#CCFBF1',
          fontSize: 17,
          lineHeight: 1.55,
          margin: '0 0 32px',
        }}>
          Sin compromiso. Cancelás cuando quieras antes del día 30 y no te cobramos nada.
        </p>
        <Link href="/register" style={{
          display: 'inline-block',
          background: '#FFFFFF',
          color: COLORS.primary,
          padding: '16px 36px',
          borderRadius: 12,
          textDecoration: 'none',
          fontSize: 17,
          fontWeight: 700,
          boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
        }}>
          Crear mi cuenta →
        </Link>
      </div>
    </section>
  )
}
