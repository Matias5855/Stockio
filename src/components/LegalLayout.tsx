/**
 * Layout compartido para paginas legales (Terminos, Privacidad).
 *
 * Centra el contenido, le da tipografia consistente, header con logo +
 * volver al inicio, y footer minimo. El cuerpo se inyecta como HTML
 * crudo (viene del generador Termly) — por eso usamos
 * dangerouslySetInnerHTML, pero es contenido nuestro confiable.
 */
import Link from 'next/link'
import { COLORS } from '@/lib/theme'

export default function LegalLayout({ title, html }: { title: string; html: string }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#FFFFFF',
      color: '#1C4542',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Header */}
      <header style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #CCFBF1',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{
              width: 32, height: 32, background: COLORS.primary, color: '#FFFFFF',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 16,
            }}>S</div>
            <span style={{ color: '#042F2E', fontWeight: 800, fontSize: 18 }}>Stockio</span>
          </Link>
          <Link href="/" style={{
            color: COLORS.primary, fontSize: 14, fontWeight: 600,
            textDecoration: 'none',
          }}>
            ← Volver al inicio
          </Link>
        </div>
      </header>

      {/* Contenido */}
      <main style={{
        maxWidth: 820,
        margin: '0 auto',
        padding: '48px 24px',
      }}>
        <h1 style={{
          fontSize: 32, fontWeight: 800, color: '#042F2E',
          margin: '0 0 32px', letterSpacing: '-0.02em',
        }}>
          {title}
        </h1>

        <article className="legal-content" dangerouslySetInnerHTML={{ __html: html }} />
      </main>

      {/* Footer minimo */}
      <footer style={{
        background: '#042F2E',
        color: '#5EEAD4',
        padding: '24px',
        textAlign: 'center',
        fontSize: 12,
        marginTop: 48,
      }}>
        © {new Date().getFullYear()} Stockio · Resistencia, Chaco 🇦🇷 ·{' '}
        <Link href="/terminos" style={{ color: '#5EEAD4', textDecoration: 'underline' }}>Términos</Link>
        {' · '}
        <Link href="/privacidad" style={{ color: '#5EEAD4', textDecoration: 'underline' }}>Privacidad</Link>
      </footer>

      {/* Estilos del contenido inyectado */}
      <style>{`
        .legal-content {
          color: #1C4542;
          font-size: 15px;
          line-height: 1.65;
        }
        .legal-content h1, .legal-content h2 {
          color: #042F2E;
          font-size: 22px;
          font-weight: 700;
          margin: 32px 0 12px;
          letter-spacing: -0.01em;
        }
        .legal-content h3 {
          color: #042F2E;
          font-size: 17px;
          font-weight: 700;
          margin: 24px 0 8px;
        }
        .legal-content p, .legal-content div {
          margin: 10px 0;
        }
        .legal-content ul, .legal-content ol {
          margin: 12px 0 12px 24px;
          padding: 0;
        }
        .legal-content li {
          margin: 6px 0;
        }
        .legal-content a {
          color: ${COLORS.primary};
          text-decoration: underline;
        }
        .legal-content strong {
          color: #042F2E;
          font-weight: 700;
        }
        .legal-content em {
          color: #115E59;
          font-style: italic;
        }
        /* Limpiar artefactos del generador Termly */
        .legal-content bdt {
          all: unset;
        }
        .legal-content [data-custom-class] {
          all: unset;
          display: inherit;
          color: inherit;
          font-family: inherit;
        }
        .legal-content [data-custom-class='title'] {
          display: block;
          font-size: 26px;
          font-weight: 800;
          color: #042F2E;
          margin: 24px 0 8px;
        }
        .legal-content [data-custom-class='subtitle'] {
          display: block;
          color: #6B7280;
          font-size: 14px;
          margin-bottom: 24px;
        }
        .legal-content [data-custom-class='heading_1'] {
          display: block;
          font-size: 20px;
          font-weight: 700;
          color: #042F2E;
          margin: 28px 0 12px;
        }
        .legal-content [data-custom-class='heading_2'] {
          display: block;
          font-size: 17px;
          font-weight: 700;
          color: #042F2E;
          margin: 20px 0 8px;
        }
        .legal-content [data-custom-class='body_text'] {
          color: #1C4542;
          font-size: 15px;
          line-height: 1.65;
        }
        .legal-content [data-custom-class='link'] {
          color: ${COLORS.primary};
          text-decoration: underline;
          word-break: break-word;
        }
      `}</style>
    </div>
  )
}
