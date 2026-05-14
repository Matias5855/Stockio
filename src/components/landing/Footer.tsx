import Link from 'next/link'

export default function Footer() {
  return (
    <footer style={{
      background: '#042F2E',
      color: '#5EEAD4',
      padding: '48px 24px 24px',
    }}>
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 32,
      }}>
        {/* Marca */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{
              width: 32,
              height: 32,
              background: '#0D9488',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16,
            }}>S</div>
            <span style={{ color: '#FFFFFF', fontWeight: 800, fontSize: 18 }}>StockFlow</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: '#5EEAD4' }}>
            Gestión inteligente para PyMEs argentinas.
            Hecho en Resistencia, Chaco 🇦🇷
          </p>
        </div>

        {/* Producto */}
        <div>
          <h4 style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
            Producto
          </h4>
          <FooterLink href="#features">Funciones</FooterLink>
          <FooterLink href="#beneficios">Beneficios</FooterLink>
          <FooterLink href="#faq">Preguntas</FooterLink>
        </div>

        {/* Cuenta */}
        <div>
          <h4 style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
            Cuenta
          </h4>
          <FooterLink href="/login">Iniciar sesión</FooterLink>
          <FooterLink href="/register">Probar gratis</FooterLink>
        </div>

        {/* Contacto */}
        <div>
          <h4 style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
            Contacto
          </h4>
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: '#5EEAD4' }}>
            Resistencia, Chaco<br />
            WhatsApp: +54 9 ...<br />
            soporte@stockflow.com.ar
          </p>
        </div>
      </div>

      <div style={{
        borderTop: '1px solid #134E4A',
        marginTop: 40,
        paddingTop: 20,
        textAlign: 'center',
        fontSize: 12,
        color: '#5EEAD4',
      }}>
        © {new Date().getFullYear()} StockFlow. Todos los derechos reservados.
      </div>
    </footer>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{
      display: 'block',
      color: '#5EEAD4',
      textDecoration: 'none',
      fontSize: 13,
      padding: '4px 0',
    }}>
      {children}
    </Link>
  )
}
