/**
 * Email de confirmacion cuando MP aprueba el primer cobro de la suscripcion.
 * Se dispara desde el webhook MP al recibir el preapproval autorizado.
 *
 * Tono celebratorio + recordatorio de funcionalidades premium si corresponde.
 */
import { Button, Section, Text } from '@react-email/components'
import * as React from 'react'
import EmailLayout, { button, heading, paragraph, muted, callout } from './_EmailLayout'

type Props = {
  nombre: string
  negocio: string
  planId: 'normal' | 'premium'
  appUrl: string
  proximoCobro?: string  // Fecha proxima cobranza (formato corto, opcional)
}

const PLAN_LABEL = {
  normal: { nombre: 'Stockio Normal',  precio: '$14.990' },
  premium: { nombre: 'Stockio Premium', precio: '$24.990' },
}

export default function SubscriptionActivatedEmail({
  nombre = 'Matías',
  negocio = 'Boutique Sofía',
  planId = 'normal',
  appUrl = 'https://stockio.com.ar',
  proximoCobro,
}: Props) {
  const plan = PLAN_LABEL[planId]

  return (
    <EmailLayout preview={`¡Suscripción activada! Bienvenido a ${plan.nombre}.`}>
      <Text style={heading}>¡Suscripción activada! ✓</Text>

      <Text style={paragraph}>
        Hola {nombre}, recibimos el pago. <strong>{negocio}</strong> ya está suscripto a{' '}
        <strong>{plan.nombre}</strong> ({plan.precio}/mes).
      </Text>

      <Section style={callout}>
        <Text style={{ ...muted, margin: 0 }}>
          <strong>Plan activo:</strong> {plan.nombre}
          <br />
          <strong>Próximo cobro:</strong> {proximoCobro ?? 'el mismo día del mes próximo'}
          <br />
          <strong>Cancelable:</strong> en cualquier momento, sin costo
        </Text>
      </Section>

      <Text style={paragraph}>
        Podés ver el detalle de tu suscripción y cambiar de plan cuando quieras desde
        Configuración → Suscripción.
      </Text>

      {planId === 'premium' && (
        <Text style={paragraph}>
          Con el plan <strong>Premium</strong> ya podés invitar empleados con roles
          personalizados y ver el historial completo de cambios.
        </Text>
      )}

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={`${appUrl}/dashboard`} style={button}>
          Ir al dashboard
        </Button>
      </Section>

      <Text style={muted}>
        Si necesitás factura A o tenés dudas administrativas, escribinos a
        soporte@stockio.com.ar
      </Text>
    </EmailLayout>
  )
}
