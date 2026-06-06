/**
 * POST /api/suscripcion/cancelar
 *
 * Cancela la suscripcion del usuario en Mercado Pago y marca la fila
 * local como cancelada. Solo el OWNER de la org puede ejecutarlo.
 *
 * Por Ley 24.240 art. 10 ter (Argentina), la cancelacion tiene que ser
 * tan facil como la contratacion. Por eso esta accion es directa y no
 * requiere atencion al cliente / chat / formulario.
 *
 * El user queda con acceso hasta que termine el ciclo de cobro ya pagado
 * (eso lo maneja MP automaticamente). Cuando vence, el paywall lo bloquea.
 */
import { NextResponse } from 'next/server'
import { requireRole, AuthError } from '@/lib/auth/requireUser'

export const dynamic = 'force-dynamic'

const MP_BASE = 'https://api.mercadopago.com'

export async function POST() {
  try {
    const { supabase, profile } = await requireRole(['owner'])
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN

    if (!ACCESS_TOKEN) {
      return NextResponse.json({
        error: 'Mercado Pago no esta configurado en el servidor',
      }, { status: 503 })
    }

    // Buscar la suscripcion actual + mp_suscripcion_id + periodo_fin
    const { data: susc } = await supabase
      .from('suscripciones')
      .select('id, estado, mp_suscripcion_id, periodo_fin')
      .eq('org_id', profile.org_id)
      .single()

    if (!susc) {
      return NextResponse.json({ error: 'No tenes una suscripcion activa' }, { status: 404 })
    }

    if (susc.estado === 'cancelada') {
      return NextResponse.json({ error: 'Tu suscripcion ya esta cancelada' }, { status: 400 })
    }

    // Cancelar en MP si hay preapproval real
    if (susc.mp_suscripcion_id) {
      const mpRes = await fetch(`${MP_BASE}/preapproval/${susc.mp_suscripcion_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({ status: 'cancelled' }),
      })

      const mpData = await mpRes.json()

      if (!mpRes.ok) {
        // Si MP devuelve 404 o que ya esta cancelado, lo tomamos como exito
        const yaCancelado =
          mpData.message?.toLowerCase?.()?.includes('already') ||
          mpData.message?.toLowerCase?.()?.includes('cancelled') ||
          mpRes.status === 404

        if (!yaCancelado) {
          console.error('[Cancelar suscripcion] MP rechazo:', JSON.stringify(mpData))
          return NextResponse.json({
            error: `Mercado Pago: ${mpData.message ?? 'no pudo cancelar'}`,
          }, { status: 502 })
        }
      }
    }

    // Decidir si hay grace period: si todavia le queda periodo pagado,
    // mantenemos acceso hasta que termine (Ley 24.240 — el user pago el mes
    // completo, tiene derecho a usarlo). Recien cuando periodo_fin pase, el
    // GET/cron flipea a 'cancelada' y aparece el paywall.
    const tieneGracia = susc.periodo_fin && new Date() < new Date(susc.periodo_fin)

    if (tieneGracia) {
      // Mantener 'activa' + marcar cancelar_al_terminar. El webhook de MP
      // (que va a mandar 'cancelled') respeta este flag y no baja el acceso.
      await supabase
        .from('suscripciones')
        .update({ cancelar_al_terminar: true })
        .eq('id', susc.id)

      return NextResponse.json({
        ok: true,
        acceso_hasta: susc.periodo_fin,
        mensaje: 'Suscripción cancelada. Mantenés acceso hasta el fin del período ya pagado.',
      })
    }

    // Sin periodo pagado vigente (estaba en trial, vencida, etc) -> cancelar ya.
    await supabase
      .from('suscripciones')
      .update({ estado: 'cancelada' })
      .eq('id', susc.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[Cancelar suscripcion] Error:', message)
    return NextResponse.json({ error: 'Error cancelando suscripcion' }, { status: 500 })
  }
}
