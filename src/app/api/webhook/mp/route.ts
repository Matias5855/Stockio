// Webhook que MP llama cada vez que hay un evento de pago o suscripcion.
// Configurar en MP Dashboard -> Notificaciones -> Webhooks
// URL: https://stockflow-indol.vercel.app/api/webhook/mp
//
// IMPORTANTE — Seguridad:
// Este endpoint NO usa auth de usuario, lo expone el proxy.ts como publico.
// La unica defensa contra falsificacion es la firma HMAC (x-signature) que MP
// envia en cada request. Si MP_WEBHOOK_SECRET no esta configurado o la firma
// falla, rechazamos con 401 — un atacante podria activar suscripciones gratis.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import { verifyMpSignature } from '@/lib/mpSignature'
import { from as emailFrom, replyTo } from '@/lib/email'
import SubscriptionActivatedEmail from '@/emails/SubscriptionActivatedEmail'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Leer body como texto para tenerlo intacto si despues queremos firmar
    // el manifest sobre el cuerpo (futuro). Por ahora MP firma el data.id.
    const raw = await req.text()
    let body: { type?: string; data?: { id?: string; metadata?: { tipo?: string } } }
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
    }
    const { type, data } = body

    // ── Verificar firma HMAC ───────────────────────────────────
    const check = verifyMpSignature({
      signatureHeader: req.headers.get('x-signature'),
      requestId: req.headers.get('x-request-id'),
      dataId: data?.id,
      secret: process.env.MP_WEBHOOK_SECRET,
    })
    if (!check.ok) {
      console.error('[Webhook MP] Firma invalida:', check.reason)
      return NextResponse.json({ error: 'Firma invalida' }, { status: 401 })
    }

    // Recien ahora podemos confiar en el payload
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN!

    // ── PAGO APROBADO ────────────────────────────────────────
    if (type === 'payment' && data?.id) {
      const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      })
      const payment = await paymentRes.json()

      if (payment.status === 'approved') {
        const orgId = payment.external_reference

        await supabase.from('pagos').insert({
          org_id: orgId,
          mp_payment_id: String(payment.id),
          monto: payment.transaction_amount,
          estado: payment.status,
          concepto: payment.description,
          metadata: payment,
        })

        await supabase.from('suscripciones')
          .update({
            estado: 'activa',
            periodo_inicio: new Date().toISOString(),
            periodo_fin: new Date(Date.now() + 31 * 24 * 3600 * 1000).toISOString(),
          })
          .eq('org_id', orgId)
      }

      // ── PAGO DE CUOTA DIGITAL (link MP) ────────────────────
      if (payment.metadata?.tipo === 'cuota_cliente') {
        const cuotaId = payment.metadata?.cuota_pago_id

        if (payment.status === 'approved' && cuotaId) {
          await supabase.from('cuota_pagos').update({
            estado: 'pagada',
            fecha_pago: new Date().toISOString().split('T')[0],
            mp_payment_id: String(payment.id),
            metodo_pago: 'mp',
          }).eq('id', cuotaId)

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

    // ── EVENTO DE SUSCRIPCION ────────────────────────────────
    if (type === 'subscription_preapproval' && data?.id) {
      const suscRes = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      })
      const susc = await suscRes.json()

      const estadoMap: Record<string, string> = {
        authorized: 'activa',
        paused:     'pausada',
        cancelled:  'cancelada',
        pending:    'trial',
      }

      // Matchear por external_reference (org_id que anexamos al init_point del
      // plan). En el primer webhook mp_suscripcion_id local todavia es NULL,
      // por eso no se podia matchear por ese campo. Aprovechamos para guardarlo.
      const orgId = susc.external_reference
      if (orgId) {
        const nuevoEstado = estadoMap[susc.status] ?? 'vencida'

        // Leer estado anterior para detectar transicion -> activa
        const { data: previa } = await supabase
          .from('suscripciones').select('estado, plan_id')
          .eq('org_id', orgId).single()

        await supabase.from('suscripciones')
          .update({
            estado: nuevoEstado,
            mp_suscripcion_id: data.id,
          })
          .eq('org_id', orgId)

        // Si recien se activa (transicion trial/pausada/vencida -> activa)
        // mandamos email de confirmacion. Si ya estaba activa no mandamos
        // de nuevo (evita duplicados en eventos posteriores de MP).
        if (nuevoEstado === 'activa' && previa?.estado !== 'activa') {
          try {
            const { data: org } = await supabase
              .from('organizations').select('name').eq('id', orgId).single()
            const { data: owner } = await supabase
              .from('profiles').select('id, full_name')
              .eq('org_id', orgId).eq('role', 'owner').single()

            if (owner && org) {
              const ownerTyped = owner as { id: string; full_name: string | null }
              const { data: userInfo } = await supabase.auth.admin.getUserById(ownerTyped.id)
              const ownerEmail = userInfo?.user?.email
              const planId = (previa?.plan_id === 'premium' ? 'premium' : 'normal') as 'normal' | 'premium'

              if (ownerEmail) {
                const resend = new Resend(process.env.RESEND_API_KEY)
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stockio.com.ar'
                const orgTyped = org as { name: string }

                const html = await render(SubscriptionActivatedEmail({
                  nombre: (ownerTyped.full_name ?? 'hola').split(' ')[0],
                  negocio: orgTyped.name,
                  planId,
                  appUrl,
                }))

                await resend.emails.send({
                  from: emailFrom('Stockio'),
                  replyTo: replyTo(),
                  to: ownerEmail,
                  subject: '¡Suscripción activada en Stockio!',
                  html,
                })
              }
            }
          } catch (emailErr) {
            // Si falla el email, no abortar el webhook — la suscripcion ya quedo activa.
            console.error('[Webhook MP] No se pudo enviar email de activacion:', emailErr)
          }
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Nunca exponer detalles del error al exterior — solo loguear server-side.
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[Webhook MP] Error procesando:', message)
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 })
  }
}
