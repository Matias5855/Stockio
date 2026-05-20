'use client'
import Link from 'next/link'
import { useState } from 'react'
import { COLORS } from '@/lib/theme'

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  const linkStyle: React.CSSProperties = {
    color: '#1C4542',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    padding: '8px 14px',
    borderRadius: 6,
  }

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      borderBottom: '1px solid #CCFBF1',
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32,
            height: 32,
            background: COLORS.primary,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 16,
          }}>S</div>
          <span style={{ color: '#042F2E', fontWeight: 800, fontSize: 18 }}>Stockio</span>
        </Link>

        {/* Links desktop */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="landing-nav-links">
          <a href="#features" style={linkStyle}>Funciones</a>
          <a href="#precios" style={linkStyle}>Precios</a>
          <a href="#beneficios" style={linkStyle}>Beneficios</a>
          <a href="#resultados" style={linkStyle}>Resultados</a>
          <a href="#faq" style={linkStyle}>Preguntas</a>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/login" style={{ ...linkStyle, color: COLORS.primary }}>
            Iniciar sesión
          </Link>
          <Link href="/register" style={{
            background: COLORS.primary,
            color: '#fff',
            padding: '9px 18px',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}>
            Probar gratis
          </Link>

          {/* Mobile menu toggle (oculto por simplicidad — links del medio se esconden en mobile) */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 22,
              color: '#1C4542',
            }}
            aria-label="Menu"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile dropdown (placeholder simple) */}
      {mobileOpen && (
        <div style={{ padding: '8px 24px 16px', borderTop: '1px solid #CCFBF1' }}>
          <a href="#features" style={{ ...linkStyle, display: 'block', padding: 10 }}>Funciones</a>
          <a href="#precios" style={{ ...linkStyle, display: 'block', padding: 10 }}>Precios</a>
          <a href="#beneficios" style={{ ...linkStyle, display: 'block', padding: 10 }}>Beneficios</a>
          <a href="#resultados" style={{ ...linkStyle, display: 'block', padding: 10 }}>Resultados</a>
          <a href="#faq" style={{ ...linkStyle, display: 'block', padding: 10 }}>Preguntas</a>
        </div>
      )}
    </nav>
  )
}
