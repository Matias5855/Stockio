/**
 * Email cuando el trial vencio (estado = vencida).
 * Se manda desde el cron al detectar el vencimiento. Foco en recuperar al
 * usuario sin perder profesionalismo.
 */
import { Button, Section, Text } from '@react-email/components'
import * as React from 'react'
import EmailLayout, { button, heading, paragraph, muted, callout } from './_EmailLayout'

type Props = {
  nombre: string
  negocio: string
  appUrl: string
}

export default function TrialExpiredEmail({
  nombre = 'Matías',
  negocio = 'Boutique Sofía',
  appUrl = 'https://stockio.com.ar',
}: Props) {
  return (
    <EmailLayout preview={`Tu prueba de Stockio se terminó — activá tu plan en 1 click`}>
      <Text style={heading}>Tu prueba terminó</Text>

      <Text style={paragraph}>
        Hola {nombre}, los 30 días de prueba de <strong>{negocio}</strong> en Stockio se
        cumplieron. Por ahora pausamos tu acceso hasta que actives un plan.
      </Text>

      <Text style={paragraph}>
        Tus datos están <strong>todos a salvo</strong> — productos, ventas, cuotas, archivos.
        Apenas reactivás la suscripción, todo vuelve exactamente como lo dejaste.
      </Text>

      <Section style={callout}>
        <Text style={{ ...muted, margin: 0 }}>
          <strong>Stockio Normal</strong> — $14.990/mes · 1 usuario
          <br />
          <strong>Stockio Premium</strong> — $24.990/mes · usuarios ilimitados con roles
        </Text>
      </Section>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={`${appUrl}/dashboard`} style={button}>
          Activar mi plan
        </Button>
      </Section>

      <Text style={muted}>
        ¿No es para vos? Sin problema. Si en algún momento volvés, te esperamos. Si pensás que
        esto es un error o necesitás más tiempo, escribinos a soporte@stockio.com.ar y vemos
        cómo ayudarte.
      </Text>
    </EmailLayout>
  )
}
