/**
 * Layout base para TODOS los emails de Stockio.
 *
 * - Tipografia sans-serif del sistema (fallback de Inter no carga via web font
 *   porque Gmail filtra @import).
 * - Una columna max 560px centrada — ancho estandar de email transaccional.
 * - Header con logo + nombre.
 * - Footer con disclaimer + unsubscribe link a futuro (de momento email de soporte).
 * - Paleta teal alineada con la web (#0D9488 = primario).
 *
 * Tomar este como template base. Cada email concreto importa este y le pasa
 * `preview` (texto que aparece en la bandeja de entrada al lado del subject)
 * y `children` (el cuerpo).
 */
import {
  Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Tailwind, Text,
} from '@react-email/components'
import * as React from 'react'

type Props = {
  preview: string  // 90 chars max, aparece en la lista de mails al lado del subject
  children: React.ReactNode
}

// URL base usada para links + logo. En producción es stockio.com.ar; si la env
// var no esta seteada (preview server local) fallback al dominio real.
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://stockio.com.ar'

export default function EmailLayout({ preview, children }: Props) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body style={bodyStyle}>
          <Container style={containerStyle}>
            {/* Header con logo */}
            <Section style={headerStyle}>
              <Link href={BASE_URL} style={{ textDecoration: 'none', display: 'inline-block' }}>
                <table cellPadding={0} cellSpacing={0} role="presentation" style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ verticalAlign: 'middle', paddingRight: 10 }}>
                        <div style={logoBoxStyle}>S</div>
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <span style={logoTextStyle}>Stockio</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Link>
            </Section>

            {/* Cuerpo */}
            <Section style={contentStyle}>{children}</Section>

            {/* Footer */}
            <Hr style={hrStyle} />
            <Section style={footerStyle}>
              <Text style={footerTextStyle}>
                Recibiste este email porque tenés una cuenta en Stockio.
                <br />
                Si tenés dudas escribinos a{' '}
                <Link href="mailto:soporte@stockio.com.ar" style={footerLinkStyle}>
                  soporte@stockio.com.ar
                </Link>
              </Text>
              <Text style={footerSmallStyle}>
                © {new Date().getFullYear()} Stockio · Gestión para PyMEs argentinas
              </Text>
            </Section>
          </Container>

          {/* Logo Img usado solo si queremos cambiarlo en el futuro a una imagen.
              Lo dejo importado para que TS no se queje si no se usa. */}
          <Img src={`${BASE_URL}/icon-192.png`} width="0" height="0" alt="" style={{ display: 'none' }} />
        </Body>
      </Tailwind>
    </Html>
  )
}

// ---------- Estilos compartidos ----------
// Reusables que cada email puede importar
export const button: React.CSSProperties = {
  backgroundColor: '#0D9488',
  color: '#FFFFFF',
  padding: '12px 28px',
  borderRadius: 10,
  textDecoration: 'none',
  fontWeight: 700,
  fontSize: 14,
  display: 'inline-block',
}

export const heading: React.CSSProperties = {
  color: '#042F2E',
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  margin: '0 0 14px',
  lineHeight: 1.3,
}

export const paragraph: React.CSSProperties = {
  color: '#1C4542',
  fontSize: 14,
  lineHeight: 1.6,
  margin: '0 0 14px',
}

export const muted: React.CSSProperties = {
  color: '#6B7280',
  fontSize: 13,
  lineHeight: 1.6,
  margin: '0 0 10px',
}

export const callout: React.CSSProperties = {
  background: '#F0FDFA',
  border: '1px solid #CCFBF1',
  borderRadius: 10,
  padding: '14px 16px',
  margin: '18px 0',
}

// ---------- Estilos privados ----------
const bodyStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: '28px 12px',
}

const containerStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: '0 auto',
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  padding: '22px 32px 18px',
  borderBottom: '1px solid #F1F5F9',
}

const logoBoxStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  background: '#0D9488',
  color: '#FFFFFF',
  borderRadius: 8,
  textAlign: 'center',
  lineHeight: '32px',
  fontWeight: 800,
  fontSize: 16,
}

const logoTextStyle: React.CSSProperties = {
  color: '#042F2E',
  fontWeight: 800,
  fontSize: 19,
  letterSpacing: '-0.01em',
}

const contentStyle: React.CSSProperties = {
  padding: '28px 32px 8px',
}

const hrStyle: React.CSSProperties = {
  borderColor: '#F1F5F9',
  margin: '24px 0 0',
}

const footerStyle: React.CSSProperties = {
  padding: '18px 32px 22px',
  background: '#FAFBFC',
}

const footerTextStyle: React.CSSProperties = {
  color: '#6B7280',
  fontSize: 12,
  lineHeight: 1.6,
  margin: '0 0 8px',
}

const footerSmallStyle: React.CSSProperties = {
  color: '#9CA3AF',
  fontSize: 11,
  margin: 0,
}

const footerLinkStyle: React.CSSProperties = {
  color: '#0D9488',
  textDecoration: 'none',
}
