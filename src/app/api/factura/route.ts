// API Route: POST /api/factura
// Recibe los datos de la venta, llama a ARCA, genera PDF y envía por email

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { crearARCAService, DatosFactura } from '@/lib/arca'
import { ticketBase64, TicketData } from '@/lib/ticket'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const { venta_id, email_cliente, usar_arca = false } = body

    // 1. Obtener datos de la venta
    const { data: venta } = await supabase
      .from('ventas')
      .select('*, venta_items(*)')
      .eq('id', venta_id)
      .single()

    if (!venta) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })

    // 2. Obtener datos del negocio
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, organizations(*)')
      .eq('id', user.id)
      .single()

    const org = (profile as any)?.organizations
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
          tipo_comprobante: 11, // Factura C (para Monotributistas)
          nombre_receptor: venta.cliente_nombre ?? 'Consumidor Final',
          items: (venta.venta_items ?? []).map((i: any) => ({
            descripcion: i.producto_nombre,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            alicuota_iva: 0, // Monotributista no discrimina IVA
          })),
        }

        const resultado = await arca.emitirFactura(datosFactura)
        cae = resultado.cae
        cae_vencimiento = resultado.cae_vencimiento
        tipo_comprobante = 'C'

        // Guardar CAE en la venta
        await supabase.from('ventas').update({
          notas: `CAE: ${cae} | Vto: ${cae_vencimiento}`,
        }).eq('id', venta_id)

      } catch (arcaErr: any) {
        console.error('Error ARCA:', arcaErr.message)
        // Si ARCA falla, continuamos con ticket interno
      }
    }

    // 4. Generar PDF
    const ticketData: TicketData = {
      nro_factura: venta.nro_factura,
      fecha: venta.fecha,
      cliente_nombre: venta.cliente_nombre ?? 'Consumidor Final',
      negocio_nombre: org?.name ?? 'Mi Negocio',
      negocio_cuit: process.env.ARCA_CUIT,
      items: (venta.venta_items ?? []).map((i: any) => ({
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

    // 5. Enviar email con Resend
    if (email_cliente) {
      await resend.emails.send({
        from: `${org?.name ?? 'StockFlow'} <onboarding@resend.dev>`,
        to: email_cliente,
        subject: `Tu comprobante ${venta.nro_factura}`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <div style="background: #7C6FE0; padding: 24px; border-radius: 12px 12px 0 0;">
              <h2 style="color: white; margin: 0;">${org?.name ?? 'Mi Negocio'}</h2>
            </div>
            <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #eee;">
              <p style="color: #333;">Hola <strong>${venta.cliente_nombre}</strong>,</p>
              <p style="color: #555;">Adjuntamos el comprobante de tu compra por <strong>$${venta.total.toLocaleString('es-AR')}</strong>.</p>
              ${cae ? `<p style="color: #555; font-size: 12px;">CAE: ${cae} | Vto: ${cae_vencimiento}</p>` : ''}
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

  } catch (err: any) {
    console.error('Error /api/factura:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}