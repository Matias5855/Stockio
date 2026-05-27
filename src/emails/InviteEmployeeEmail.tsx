/**
 * Invitacion a un empleado para sumarse a una org.
 * Reemplaza el HTML inline de src/app/api/empleados/invitar/route.ts.
 */
import { Button, Section, Text } from '@react-email/components'
import * as React from 'react'
import EmailLayout, { button, heading, paragraph, muted } from './_EmailLayout'

type Props = {
  orgName: string     // Nombre del negocio que invita
  inviterName?: string // Quien envia (owner)
  acceptUrl: string   // Link de aceptacion con el token
  expiresAt?: string  // Fecha de expiracion (ISO o ya formateada)
}

export default function InviteEmployeeEmail({
  orgName = 'Boutique Sofía',
  inviterName = 'Matías',
  acceptUrl = 'https://stockio.com.ar/invite/abc123',
  expiresAt = '7 días',
}: Props) {
  return (
    <EmailLayout preview={`Te invitaron a usar Stockio en ${orgName}`}>
      <Text style={heading}>Te invitaron a {orgName}</Text>

      <Text style={paragraph}>
        {inviterName ? `${inviterName} te invitó` : 'Te invitaron'} a sumarte como empleado al
        sistema de gestión de <strong>{orgName}</strong> en Stockio.
      </Text>

      <Text style={paragraph}>
        Vas a poder cargar ventas, ver el inventario y trabajar con los demás según los permisos
        que te asignaron.
      </Text>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={acceptUrl} style={button}>
          Aceptar invitación
        </Button>
      </Section>

      <Text style={muted}>
        Este link expira en <strong>{expiresAt}</strong>. Si no lo esperabas, podés ignorar este
        email.
      </Text>
    </EmailLayout>
  )
}
