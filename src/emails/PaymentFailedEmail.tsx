/**
 * Email que se manda cuando MP NO pudo cobrar la cuota mensual de la
 * suscripcion (tarjeta sin fondos, vencida, etc).
 *
 * Se dispara desde el webhook MP al recibir un subscription_authorized_payment
 * con el pago en estado 'rejected'. Idempotente via pago_fallido_aviso_at
 * (no re-enviamos en cada reintento de MP).
 *
 * Objetivo: que el cliente actualice su tarjeta ANTES de que MP agote los
 * reintentos y pause la suscripcion. Retencion pura.
 */
import { Button, Section, Text } from '@react-email/components'
import * as React from 'react'
import EmailLayout, { button, heading, paragraph, muted, callout } from './_EmailLayout'

type Props = {
  nombre: string
  negocio: string
  appUrl: string
  // Cuantos dias le quedan antes de que se corte el acceso (aprox segun MP)
  diasGracia?: number
}

export default function PaymentFailedEmail({
  nombre = 'Matías',
  negocio = 'Boutique Sofía',
  appUrl = 'https://stockio.com.ar',
  diasGracia = 7,
}: Props) {
  return (
    <EmailLayout preview="No pudimos procesar el pago de tu suscripción a Stockio">
      <Text style={heading}>No pudimos cobrar tu suscripción</Text>

      <Text style={paragraph}>
        Hola {nombre}, intentamos cobrar la cuota mensual de Stockio para{' '}
        <strong>{negocio}</strong> pero el pago fue rechazado. Suele pasar por
        fondos insuficientes, una tarjeta vencida o un límite del banco.
      </Text>

      <Section style={callout}>
        <Text style={{ ...muted, margin: 0 }}>
          <strong>Qué hacer:</strong> entrá a Stockio y actualizá tu medio de
          pago. Mercado Pago va a reintentar el cobro automáticamente.
          <br />
          <strong>Importante:</strong> si no se regulariza en los próximos{' '}
          {diasGracia} días, el acceso a tu cuenta se va a suspender hasta
          que el pago se complete.
        </Text>
      </Section>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={`${appUrl}/dashboard`} style={button}>
          Actualizar medio de pago
        </Button>
      </Section>

      <Text style={muted}>
        Tus datos (productos, ventas, clientes) están a salvo — no se pierde
        nada. Solo necesitamos regularizar el pago para que sigas usando la app.
        Cualquier duda, escribinos a soporte@stockio.com.ar
      </Text>
    </EmailLayout>
  )
}
