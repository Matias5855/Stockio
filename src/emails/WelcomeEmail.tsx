/**
 * Email de bienvenida que se manda al registrarse.
 * Reemplaza el HTML inline que estaba en src/app/api/auth/register/route.ts.
 */
import { Button, Section, Text } from '@react-email/components'
import * as React from 'react'
import EmailLayout, { button, heading, paragraph, callout, muted } from './_EmailLayout'

type Props = {
  nombre: string       // Nombre del user que se registro
  negocio: string      // Nombre de la org
  appUrl: string       // URL base de la app — link al dashboard
}

export default function WelcomeEmail({
  nombre = 'Matías',
  negocio = 'Boutique Sofía',
  appUrl = 'https://stockio.com.ar',
}: Props) {
  return (
    <EmailLayout preview={`¡Bienvenido a Stockio, ${nombre}! Tu prueba de 30 días arrancó.`}>
      <Text style={heading}>¡Hola, {nombre}! 👋</Text>

      <Text style={paragraph}>
        Te damos la bienvenida a Stockio. Tu cuenta para <strong>{negocio}</strong> ya está lista
        y arrancaste con <strong>30 días gratis</strong> para probar todo el sistema sin
        compromiso.
      </Text>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={`${appUrl}/dashboard`} style={button}>
          Entrar al dashboard
        </Button>
      </Section>

      <Text style={paragraph}>En estos 30 días vas a poder:</Text>

      <Section style={callout}>
        <Text style={{ ...muted, margin: 0 }}>
          ✓ Cargar tu inventario completo con SKU, talles y colores
          <br />
          ✓ Registrar ventas y emitir tickets en PDF
          <br />
          ✓ Conectar Mercado Pago y cobrar online
          <br />
          ✓ Armar planes de cuotas con seguimiento automático
          <br />
          ✓ Invitar empleados (plan Premium)
        </Text>
      </Section>

      <Text style={paragraph}>
        Si te trabás con algo, respondé este mail o escribinos a{' '}
        <strong>soporte@stockio.com.ar</strong>. Estamos del otro lado.
      </Text>

      <Text style={muted}>— El equipo de Stockio</Text>
    </EmailLayout>
  )
}
