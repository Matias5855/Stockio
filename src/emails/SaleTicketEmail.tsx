/**
 * Email que se envia al cliente con el ticket de una venta (PDF adjunto).
 * Reemplaza el HTML inline de src/app/api/factura/route.ts.
 *
 * El PDF se adjunta al email — este componente solo arma el body, NO incluye
 * el PDF en si (eso lo maneja el route con `attachments` de Resend).
 */
import { Section, Text } from '@react-email/components'
import * as React from 'react'
import EmailLayout, { heading, paragraph, callout, muted } from './_EmailLayout'

type Props = {
  orgName: string       // Nombre del negocio que emite
  ventaNumero: number | string  // Numero de venta / comprobante
  total: number         // Total en ARS
  clienteNombre?: string
}

function fmtARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

export default function SaleTicketEmail({
  orgName = 'Boutique Sofía',
  ventaNumero = '00012',
  total = 24990,
  clienteNombre,
}: Props) {
  return (
    <EmailLayout preview={`Tu comprobante de ${orgName} por ${fmtARS(total)}`}>
      <Text style={heading}>
        {clienteNombre ? `¡Gracias, ${clienteNombre}!` : '¡Gracias por tu compra!'}
      </Text>

      <Text style={paragraph}>
        Te enviamos el comprobante de tu compra en <strong>{orgName}</strong>. Está adjunto a
        este email en formato PDF.
      </Text>

      <Section style={callout}>
        <Text style={{ ...muted, margin: 0, fontSize: 14 }}>
          <strong>Comprobante:</strong> #{ventaNumero}
          <br />
          <strong>Total:</strong> {fmtARS(total)}
        </Text>
      </Section>

      <Text style={paragraph}>
        Ante cualquier consulta sobre la compra, respondé este email y te contestamos a la
        brevedad.
      </Text>

      <Text style={muted}>— {orgName}</Text>
    </EmailLayout>
  )
}
