// API Route: POST /api/factura
// Recibe los datos de la venta, llama a ARCA, genera PDF y envía por email

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import { crearARCAServiceCon, DatosFactura } from '@/lib/arca'
import { ticketBase64, TicketData } from '@/lib/ticket'
import { requireOrgMember, exigirPermiso, AuthError } from '@/lib/auth/requireUser'
import { createAdminClient } from '@/lib/supabase/admin'

// Los secretos del negocio (mp_access_token, certificados de ARCA) ya no son
// legibles con el cliente del usuario: se les revoco el SELECT sobre esas
// columnas (ver db/rls_fase_b3_secretos.sql). Esta ruta los necesita de
// verdad, asi que usa service_role — DESPUES de validar el rol arriba, y
// filtrando siempre por el org_id del profile verificado, nunca del body.
import { parseBody, FacturaInputSchema, ValidationError } from '@/lib/schemas'
import { decryptSecret } from '@/lib/crypto'
import { from as emailFrom, replyTo } from '@/lib/email'
import SaleTicketEmail from '@/emails/SaleTicketEmail'

export const dynamic = 'force-dynamic'

type VentaItemRow = {
  producto_nombre: string
  cantidad: number
  precio_unitario: number
  subtotal?: number
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, profile } = await requireOrgMember()
    const resend = new Resend(process.env.RESEND_API_KEY)

    const { venta_id, email_cliente, usar_arca } = await parseBody(req, FacturaInputSchema)

    // Esta ruta sirve dos acciones con exigencias distintas, y por eso el
    // permiso se chequea aca y no arriba:
    //  - usar_arca: true  -> emite CAE ante AFIP. Acto fiscal. La UI lo gatea
    //    con `editar_ventas` (ventas/page.tsx:610), pero hasta ahora la ruta
    //    aceptaba el flag de cualquier miembro de la org: se salteaba con un
    //    POST a mano.
    //  - usar_arca: false -> genera el PDF y lo manda por email. La UI NO lo
    //    gatea (el boton ✉ lo ve cualquiera que vea ventas), asi que tampoco
    //    se gatea aca. Exigir el permiso para todo el endpoint le sacaria a un
    //    vendedor algo que hoy funciona.
    if (usar_arca) exigirPermiso(profile, 'editar_ventas')

    // 1. Obtener venta y validar que pertenezca a la org del usuario
    const { data: venta } = await supabase
      .from('ventas')
      .select('*, venta_items(*), org_id')
      .eq('id', venta_id)
      .single()

    if (!venta) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    if (venta.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    // 2. Obtener datos del negocio
    const { data: org } = await createAdminClient()
      .from('organizations')
      .select('*')
      .eq('id', profile.org_id)
      .single()

    let cae: string | undefined
    let cae_vencimiento: string | undefined
    const tipo_comprobante: 'A' | 'B' | 'C' | 'X' = 'C'  // Siempre Factura C en este SaaS
    let arcaError: string | null = null

    // 3. Llamar a ARCA solo si la org tiene ARCA activado y configurado
    if (usar_arca && org?.arca_activado && org?.arca_cert_pem_enc && org?.arca_private_key_pem_enc) {
      try {
        const certPEM = decryptSecret(org.arca_cert_pem_enc)
        const privateKeyPEM = decryptSecret(org.arca_private_key_pem_enc)

        const arca = crearARCAServiceCon({
          cuit: org.arca_cuit ?? '',
          certPEM,
          privateKeyPEM,
          puntoVenta: parseInt(org.arca_punto_venta ?? '1', 10),
          ambiente: org.arca_ambiente === 'produccion' ? 'produccion' : 'testing',
        })

        const datosFactura: DatosFactura = {
          tipo_comprobante: 11, // Factura C (Monotributistas)
          nombre_receptor: venta.cliente_nombre ?? 'Consumidor Final',
          items: ((venta.venta_items ?? []) as VentaItemRow[]).map((i) => ({
            descripcion: i.producto_nombre,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            alicuota_iva: 0, // Monotributo no discrimina IVA
          })),
        }

        const resultado = await arca.emitirFactura(datosFactura)
        cae = resultado.cae
        cae_vencimiento = resultado.cae_vencimiento

        // Guardar CAE en la venta para futuras referencias.
        //
        // Este error NO se puede tragar. Para cuando llegamos aca, AFIP YA
        // autorizo la factura y consumio el numero: si el update falla, el
        // comercio tiene un comprobante fiscal emitido del que no queda
        // registro, y no hay forma de recuperarlo desde la app.
        const { error: caeErr } = await supabase.from('ventas').update({
          notas: `CAE: ${cae} | Vto: ${cae_vencimiento}`,
        }).eq('id', venta_id)

        if (caeErr) {
          console.error('[Factura] CAE OBTENIDO PERO NO GUARDADO:', {
            venta_id, cae, cae_vencimiento, error: caeErr.message,
          })
          // Se avisa al usuario con el CAE en el mensaje: es lo unico que le
          // queda para anotarlo a mano antes de que se pierda.
          arcaError = `La factura se emitió (CAE ${cae}, vence ${cae_vencimiento}) ` +
                      `pero no se pudo guardar en el sistema. Anotá ese CAE.`
        }

      } catch (arcaErr) {
        arcaError = arcaErr instanceof Error ? arcaErr.message : 'Error desconocido en ARCA'
        console.error('[Factura] ARCA fallo:', arcaError)
        // No abortamos: igual generamos el PDF sin CAE para que el comercio pueda
        // entregar al menos un comprobante interno mientras debugea la integracion.
      }
    } else if (usar_arca && !org?.arca_activado) {
      arcaError = 'ARCA no está activado para esta organización. Configurálo en Configuración → Facturación Electrónica.'
    }

    // 4. Generar PDF
    const ticketData: TicketData = {
      nro_factura: venta.nro_factura,
      fecha: venta.fecha,
      cliente_nombre: venta.cliente_nombre ?? 'Consumidor Final',
      negocio_nombre: org?.name ?? 'Mi Negocio',
      negocio_cuit: org?.arca_cuit ?? org?.cuit ?? undefined,
      negocio_direccion: org?.direccion ?? undefined,
      negocio_iibb: org?.iibb ?? undefined,
      negocio_inicio_actividades: org?.inicio_actividades ?? undefined,
      condicion_iva_emisor: org?.condicion_iva ?? 'Responsable Monotributo',
      condicion_iva_receptor: 'Consumidor Final',
      condicion_venta: 'Contado',
      punto_venta: org?.arca_punto_venta ?? org?.punto_venta ?? '0001',
      items: ((venta.venta_items ?? []) as VentaItemRow[]).map((i) => ({
        nombre: i.producto_nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal ?? i.cantidad * i.precio_unitario,
      })),
      subtotal: venta.subtotal,
      descuento: venta.descuento ?? 0,
      total: venta.total,
      tipo_comprobante,
      cae,
      cae_vencimiento,
    }

    const pdfBase64 = await ticketBase64(ticketData)

    // 5. Enviar email con el ticket adjunto. React Email escapa automaticamente
    // todo el contenido interpolado, asi que no hace falta el escapeHtml manual.
    if (email_cliente) {
      const html = await render(SaleTicketEmail({
        orgName: org?.name ?? 'Mi Negocio',
        ventaNumero: venta.nro_factura,
        total: Number(venta.total) || 0,
        clienteNombre: venta.cliente_nombre ?? undefined,
      }))

      await resend.emails.send({
        from: emailFrom(org?.name ?? 'Stockio'),
        replyTo: replyTo(),
        to: email_cliente,
        subject: `Tu comprobante ${venta.nro_factura}`,
        html,
        attachments: [{
          filename: `${venta.nro_factura}.pdf`,
          content: pdfBase64,
        }],
      })
    }

    return NextResponse.json({
      ok: true,
      cae,
      cae_vencimiento,
      tipo_comprobante,
      arca_error: arcaError,
    })

  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[Factura] Error:', message)
    return NextResponse.json({ error: 'Error generando factura' }, { status: 500 })
  }
}
