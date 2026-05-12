// API Route: POST /api/factura
// Recibe los datos de la venta, llama a ARCA, genera PDF y envía por email

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { crearARCAService, DatosFactura } from '@/lib/arca'
import { ticketBase64, TicketData } from '@/lib/ticket'
import { requireOrgMember, AuthError } from '@/lib/auth/requireUser'
import { parseBody, FacturaInputSchema, escapeHtml, ValidationError } from '@/lib/schemas'

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
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', profile.org_id)
      .single()

    let cae: string | undefined
    let cae_vencimiento: string | undefined
    let tipo_comprobante: 'A' | 'B' | 'C' | 'X' = 'X'

    // 3. Llamar a ARCA si está configurado
    if (usar_arca && process.env.ARCA_CUIT) {
      try {
        const arca = crearARCAService(
          process.env.ARCA_AMBIENTE === 'produccion' ? 'produccion' : 'testing'
        )

        const datosFactura: DatosFactura = {
          tipo_comprobante: 11, // Factura C (Monotributistas)
          nombre_receptor: venta.cliente_nombre ?? 'Consumidor Final',
          items: ((venta.venta_items ?? []) as VentaItemRow[]).map((i) => ({
            descripcion: i.producto_nombre,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            alicuota_iva: 0,
          })),
        }

        const resultado = await arca.emitirFactura(datosFactura)
        cae = resultado.cae
        cae_vencimiento = resultado.cae_vencimiento
        tipo_comprobante = 'C'

        await supabase.from('ventas').update({
          notas: `CAE: ${cae} | Vto: ${cae_vencimiento}`,
        }).eq('id', venta_id)

      } catch (arcaErr) {
        const msg = arcaErr instanceof Error ? arcaErr.message : 'unknown'
        console.error('[Factura] ARCA fallo:', msg)
      }
    }

    // 4. Generar PDF
    const ticketData: TicketData = {
      nro_factura: venta.nro_factura,
      fecha: venta.fecha,
      cliente_nombre: venta.cliente_nombre ?? 'Consumidor Final',
      negocio_nombre: org?.name ?? 'Mi Negocio',
      negocio_cuit: process.env.ARCA_CUIT,
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

    // 5. Enviar email — escapamos todo lo que viene del usuario
    if (email_cliente) {
      const orgNameSafe = escapeHtml(org?.name ?? 'Mi Negocio')
      const clienteSafe = escapeHtml(venta.cliente_nombre ?? 'Cliente')
      const totalSafe = escapeHtml(Number(venta.total).toLocaleString('es-AR'))
      const caeSafe = cae ? escapeHtml(cae) : ''
      const caeVtoSafe = cae_vencimiento ? escapeHtml(cae_vencimiento) : ''
      const nroFacturaSafe = escapeHtml(venta.nro_factura)

      await resend.emails.send({
        from: `${orgNameSafe} <onboarding@resend.dev>`,
        to: email_cliente,
        subject: `Tu comprobante ${nroFacturaSafe}`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <div style="background: #7C6FE0; padding: 24px; border-radius: 12px 12px 0 0;">
              <h2 style="color: white; margin: 0;">${orgNameSafe}</h2>
            </div>
            <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #eee;">
              <p style="color: #333;">Hola <strong>${clienteSafe}</strong>,</p>
              <p style="color: #555;">Adjuntamos el comprobante de tu compra por <strong>$${totalSafe}</strong>.</p>
              ${caeSafe ? `<p style="color: #555; font-size: 12px;">CAE: ${caeSafe} | Vto: ${caeVtoSafe}</p>` : ''}
              <p style="color: #999; font-size: 11px; margin-top: 24px;">Generado por StockFlow</p>
            </div>
          </div>
        `,
        attachments: [{
          filename: `${venta.nro_factura}.pdf`,
          content: pdfBase64,
        }],
      })
    }

    return NextResponse.json({ ok: true, cae, tipo_comprobante })

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
