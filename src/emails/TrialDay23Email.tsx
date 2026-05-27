/**
 * Email recordatorio dia 23 del trial — quedan 7 dias.
 * Tono suave, foco en valor descubierto y proximos pasos.
 */
import { Button, Section, Text } from '@react-email/components'
import * as React from 'react'
import EmailLayout, { button, heading, paragraph, muted, callout } from './_EmailLayout'

type Props = {
  nombre: string
  negocio: string
  appUrl: string
}

export default function TrialDay23Email({
  nombre = 'Matías',
  negocio = 'Boutique Sofía',
  appUrl = 'https://stockio.com.ar',
}: Props) {
  return (
    <EmailLayout preview={`${nombre}, te quedan 7 días gratis en Stockio`}>
      <Text style={heading}>Te quedan 7 días, {nombre}</Text>

      <Text style={paragraph}>
        Hace una semana que <strong>{negocio}</strong> está usando Stockio. ¡Genial!
      </Text>

      <Text style={paragraph}>
        Tu prueba gratis vence en <strong>7 días</strong>. Cuando llegue ese día, vamos a hacer
        el primer cobro con la tarjeta que dejaste cargada — vas a poder seguir trabajando sin
        cortes.
      </Text>

      <Section style={callout}>
        <Text style={{ ...muted, margin: 0 }}>
          <strong>¿Querés cambiar de plan?</strong>
          <br />
          Podés pasar a Premium o cancelar antes del cobro desde Configuración → Suscripción. Sin
          letra chica ni costo de cancelación.
        </Text>
      </Section>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={`${appUrl}/dashboard`} style={button}>
          Ir al dashboard
        </Button>
      </Section>

      <Text style={muted}>
        Si tenés dudas, respondé este mail o escribinos a soporte@stockio.com.ar
      </Text>
    </EmailLayout>
  )
}
