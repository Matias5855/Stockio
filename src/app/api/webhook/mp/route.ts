// Webhook que MP llama cada vez que hay un evento de pago o suscripcion.
// Configurar en MP Dashboard -> Tus integraciones -> tu app -> Webhooks
// URL: https://stockio.com.ar/api/webhook/mp
// Eventos: Pagos + Planes y suscripciones (subscription_preapproval +
//          subscription_authorized_payment).
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
import PaymentFailedEmail from '@/emails/PaymentFailedEmail'

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
        const incomingId = data.id
        const mapped = estadoMap[susc.status] ?? 'vencida'

        // Leer la fila actual: estado, el preapproval activo (prevId) y el flag
        // de cancelacion con grace period.
        const { data: previa } = await supabase
          .from('suscripciones')
          .select('estado, plan_id, mp_suscripcion_id, cancelar_al_terminar, periodo_fin')
          .eq('org_id', orgId).single()

        const prevId = previa?.mp_suscripcion_id ?? null

        if (susc.status === 'authorized') {
          // ── Nueva suscripcion AUTORIZADA -> pasa a ser la activa ──────
          // Cancelacion diferida: si esta autorizacion reemplaza a un
          // preapproval DISTINTO (cambio de plan / actualizar tarjeta /
          // reactivacion), recien AHORA cancelamos el viejo en MP. Asi, si el
          // usuario habia abandonado el checkout, su suscripcion anterior
          // seguia viva y NO perdia la cuenta ni pagaba de nuevo.
          if (prevId && prevId !== incomingId) {
            try {
              await fetch(`https://api.mercadopago.com/preapproval/${prevId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
                body: JSON.stringify({ status: 'cancelled' }),
              })
            } catch (e) {
              console.error('[Webhook MP] No se pudo cancelar preapproval reemplazado:', e)
            }
          }

          // plan_id autoritativo desde MP (el "reason" del plan). Si por algun
          // motivo no viene, mantenemos el plan_id que ya tenia la fila.
          const reason = typeof susc.reason === 'string' ? susc.reason.toLowerCase() : ''
          const planMp: 'normal' | 'premium' =
            reason.includes('premium') ? 'premium'
            : reason.includes('normal') ? 'normal'
            : ((previa?.plan_id === 'premium' ? 'premium' : 'normal'))

          await supabase.from('suscripciones')
            .update({
              estado: 'activa',
              mp_suscripcion_id: incomingId,
              plan_id: planMp,
              cancelar_al_terminar: false,  // re-suscribio: limpiar cancelacion pendiente
            })
            .eq('org_id', orgId)

          // Email de activacion solo si venia de un estado NO activo
          // (evita duplicados en eventos posteriores del mismo preapproval).
          if (previa?.estado !== 'activa') {
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

                if (ownerEmail) {
                  const resend = new Resend(process.env.RESEND_API_KEY)
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stockio.com.ar'
                  const orgTyped = org as { name: string }

                  const html = await render(SubscriptionActivatedEmail({
                    nombre: (ownerTyped.full_name ?? 'hola').split(' ')[0],
                    negocio: orgTyped.name,
                    planId: planMp,
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
              console.error('[Webhook MP] No se pudo enviar email de activacion:', emailErr)
            }
          }
        } else {
          // ── paused / cancelled / pending ─────────────────────────────
          // Solo aplican si el evento es de la suscripcion ACTUAL. Si llega un
          // evento de un preapproval VIEJO (el que acabamos de reemplazar y
          // cancelar al cambiar de plan), lo IGNORAMOS — sino paywallearia a un
          // usuario que justo se re-suscribio.
          const esEventoStale = prevId && incomingId !== prevId
          if (!esEventoStale) {
            let nuevoEstado = mapped

            // Grace period: si cancelo pero le queda periodo pagado, MP manda
            // 'cancelled' al instante. No bajamos acceso hasta que periodo_fin
            // pase (lo flipea el GET). Sin esto, cancelar = perder el mes pagado.
            if (
              nuevoEstado === 'cancelada' &&
              previa?.cancelar_al_terminar === true &&
              previa?.periodo_fin &&
              new Date() < new Date(previa.periodo_fin)
            ) {
              nuevoEstado = 'activa'
            }

            await supabase.from('suscripciones')
              .update({ estado: nuevoEstado, mp_suscripcion_id: incomingId })
              .eq('org_id', orgId)
          }
        }
      }
    }

    // ── COBRO RECURRENTE (cuota mensual de la suscripcion) ───────────
    // MP dispara este evento cada vez que intenta cobrar la cuota mensual de
    // un preapproval. ANTES no se manejaba: los cobros exitosos no se
    // registraban y los FALLIDOS se ignoraban (el user seguia usando gratis
    // ~10 dias y nunca recibia aviso). Ahora:
    //  - approved -> registrar pago, extender periodo_fin, asegurar 'activa'
    //  - rejected -> marcar fallo y mandar email de "actualiza tu tarjeta"
    if (type === 'subscription_authorized_payment' && data?.id) {
      const apRes = await fetch(`https://api.mercadopago.com/authorized_payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      })
      const ap = await apRes.json()

      // El authorized_payment trae el preapproval_id (= nuestro mp_suscripcion_id)
      // y el detalle del pago. El status del pago puede venir en ap.payment.status
      // o en ap.status segun la version del payload.
      const preapprovalId = ap.preapproval_id
      const pagoStatus = ap.payment?.status ?? ap.status

      if (preapprovalId) {
        const { data: sub } = await supabase
          .from('suscripciones')
          .select('org_id, estado, plan_id, pago_fallido_aviso_at')
          .eq('mp_suscripcion_id', preapprovalId)
          .single()

        if (sub?.org_id) {
          if (pagoStatus === 'approved') {
            // Registrar el cobro mensual (idempotente por mp_payment_id)
            const pagoId = ap.payment?.id ?? ap.id
            await supabase.from('pagos').insert({
              org_id: sub.org_id,
              mp_payment_id: String(pagoId),
              monto: ap.transaction_amount ?? ap.payment?.transaction_amount,
              estado: 'approved',
              concepto: 'Cuota mensual Stockio',
              metadata: ap,
            })

            await supabase.from('suscripciones')
              .update({
                estado: 'activa',
                periodo_inicio: new Date().toISOString(),
                periodo_fin: new Date(Date.now() + 31 * 24 * 3600 * 1000).toISOString(),
                ultimo_pago_fallido_at: null,
                pago_fallido_aviso_at: null,
              })
              .eq('org_id', sub.org_id)

          } else if (pagoStatus === 'rejected') {
            // Marcar el fallo. NO bajamos el acceso todavia — MP reintenta unos
            // dias y, si agota, manda subscription_preapproval=paused (que SI
            // baja el acceso). Aca solo avisamos al cliente para que actualice.
            await supabase.from('suscripciones')
              .update({ ultimo_pago_fallido_at: new Date().toISOString() })
              .eq('org_id', sub.org_id)

            // Email idempotente: solo si no avisamos en las ultimas 24h
            const yaAviso = sub.pago_fallido_aviso_at &&
              (Date.now() - new Date(sub.pago_fallido_aviso_at).getTime()) < 24 * 3600 * 1000

            if (!yaAviso) {
              try {
                const { data: org } = await supabase
                  .from('organizations').select('name').eq('id', sub.org_id).single()
                const { data: owner } = await supabase
                  .from('profiles').select('id, full_name')
                  .eq('org_id', sub.org_id).eq('role', 'owner').single()

                if (owner && org) {
                  const ownerTyped = owner as { id: string; full_name: string | null }
                  const { data: userInfo } = await supabase.auth.admin.getUserById(ownerTyped.id)
                  const ownerEmail = userInfo?.user?.email

                  if (ownerEmail) {
                    const resend = new Resend(process.env.RESEND_API_KEY)
                    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stockio.com.ar'
                    const orgTyped = org as { name: string }

                    const html = await render(PaymentFailedEmail({
                      nombre: (ownerTyped.full_name ?? 'hola').split(' ')[0],
                      negocio: orgTyped.name,
                      appUrl,
                    }))

                    await resend.emails.send({
                      from: emailFrom('Stockio'),
                      replyTo: replyTo(),
                      to: ownerEmail,
                      subject: 'No pudimos cobrar tu suscripción a Stockio',
                      html,
                    })

                    await supabase.from('suscripciones')
                      .update({ pago_fallido_aviso_at: new Date().toISOString() })
                      .eq('org_id', sub.org_id)
                  }
                }
              } catch (emailErr) {
                console.error('[Webhook MP] No se pudo enviar email de pago fallido:', emailErr)
              }
            }
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
