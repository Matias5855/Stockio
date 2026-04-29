// Webhook que MP llama cada vez que hay un evento de pago o suscripción
// Configurar en MP Dashboard → Notificaciones → Webhooks
// URL: https://stockflow-indol.vercel.app/api/webhook/mp

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Usamos service role para el webhook (sin auth de usuario)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN!

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, data } = body

    console.log('Webhook MP recibido:', type, data)

    // ── PAGO APROBADO ────────────────────────────────────────
    if (type === 'payment') {
      const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      })
      const payment = await paymentRes.json()

      if (payment.status === 'approved') {
        // Obtener org_id desde external_reference
        const orgId = payment.external_reference

        // Registrar pago
        await supabase.from('pagos').insert({
          org_id: orgId,
          mp_payment_id: String(payment.id),
          monto: payment.transaction_amount,
          estado: payment.status,
          concepto: payment.description,
          metadata: payment,
        })

        // Activar/renovar suscripción
        await supabase.from('suscripciones')
          .update({
            estado: 'activa',
            periodo_inicio: new Date().toISOString(),
            periodo_fin: new Date(Date.now() + 31 * 24 * 3600 * 1000).toISOString(),
          })
          .eq('org_id', orgId)
      }
    }

    // ── EVENTO DE SUSCRIPCIÓN ────────────────────────────────
    if (type === 'subscription_preapproval') {
      const suscRes = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      })
      const susc = await suscRes.json()
      const orgId = susc.external_reference

      const estadoMap: Record<string, string> = {
        authorized: 'activa',
        paused:     'pausada',
        cancelled:  'cancelada',
        pending:    'trial',
      }

      await supabase.from('suscripciones')
        .update({ estado: estadoMap[susc.status] ?? 'vencida' })
        .eq('mp_suscripcion_id', data.id)
    }

    // ── PAGO DE CUOTA DIGITAL (link MP) ──────────────────────
    if (type === 'payment' && data?.metadata?.tipo === 'cuota_cliente') {
      const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      })
      const payment = await paymentRes.json()

      if (payment.status === 'approved') {
        const cuotaId = payment.metadata?.cuota_pago_id

        if (cuotaId) {
          // Marcar cuota como pagada
          await supabase.from('cuota_pagos').update({
            estado: 'pagada',
            fecha_pago: new Date().toISOString().split('T')[0],
            mp_payment_id: String(payment.id),
            metodo_pago: 'mp',
          }).eq('id', cuotaId)

          // Actualizar monto pagado en cuota_venta
          const { data: cuotaPago } = await supabase
            .from('cuota_pagos').select('cuota_venta_id, monto').eq('id', cuotaId).single()

          if (cuotaPago) {
            const { data: cv } = await supabase
              .from('cuotas_ventas').select('monto_pagado, cuotas_pagadas, cantidad_cuotas, monto_total')
              .eq('id', cuotaPago.cuota_venta_id).single()

            if (cv) {
              const nuevoPagado = cv.monto_pagado + cuotaPago.monto
              const nuevasCuotasPagadas = cv.cuotas_pagadas + 1
              const completada = nuevasCuotasPagadas >= cv.cantidad_cuotas

              await supabase.from('cuotas_ventas').update({
                monto_pagado: nuevoPagado,
                cuotas_pagadas: nuevasCuotasPagadas,
                estado: completada ? 'completada' : 'activa',
              }).eq('id', cuotaPago.cuota_venta_id)
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Error webhook MP:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}