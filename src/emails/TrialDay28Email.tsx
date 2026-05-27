/**
 * Email recordatorio dia 28 del trial — vence en 2 dias.
 * Mas urgente que el de dia 23, tono "actua antes que sea tarde".
 */
import { Button, Section, Text } from '@react-email/components'
import * as React from 'react'
import EmailLayout, { button, heading, paragraph, muted } from './_EmailLayout'

type Props = {
  nombre: string
  negocio: string
  appUrl: string
}

export default function TrialDay28Email({
  nombre = 'Matías',
  negocio = 'Boutique Sofía',
  appUrl = 'https://stockio.com.ar',
}: Props) {
  return (
    <EmailLayout preview={`${nombre}, en 2 días arranca el cobro de Stockio`}>
      <Text style={heading}>Tu prueba vence en 2 días</Text>

      <Text style={paragraph}>
        Hola {nombre}, te escribo para que estés al tanto: en <strong>2 días</strong> termina tu
        período de prueba en Stockio y vamos a hacer el primer cobro mensual para que{' '}
        <strong>{negocio}</strong> siga funcionando sin cortes.
      </Text>

      <Text style={paragraph}>
        Si querés <strong>cancelar antes del cobro</strong>, podés hacerlo en menos de un minuto
        desde Configuración → Suscripción. Sin penalidad, sin letra chica.
      </Text>

      <Text style={paragraph}>
        Si querés <strong>cambiar de plan</strong> (Normal ↔ Premium), también lo hacés desde
        ahí.
      </Text>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={`${appUrl}/dashboard`} style={button}>
          Revisar mi suscripción
        </Button>
      </Section>

      <Text style={muted}>
        Si tenés cualquier duda contestá este email o escribinos a soporte@stockio.com.ar — te
        respondemos personalmente.
      </Text>
    </EmailLayout>
  )
}
