// POST /api/suscripcion — Crea suscripción en Mercado Pago
// GET  /api/suscripcion — Obtiene estado actual del plan
//
// Solo el owner puede cambiar el plan de la org. Cualquier miembro puede leer el estado.

import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMember, requireRole, AuthError } from '@/lib/auth/requireUser'
import { parseBody, SuscripcionInputSchema, ValidationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

const MP_BASE = 'https://api.mercadopago.com'

const PLANES_MP = {
  pro: {
    reason: 'StockFlow Pro',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 9990,
      currency_id: 'ARS',
      free_trial: { frequency: 1, frequency_type: 'months' },
    },
  },
  business: {
    reason: 'StockFlow Business',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 19990,
      currency_id: 'ARS',
      free_trial: { frequency: 1, frequency_type: 'months' },
    },
  },
}

// ── GET: estado del plan actual (cualquier miembro de la org) ─────
export async function GET() {
  try {
    const { supabase, profile } = await requireOrgMember()

    const { data: suscripcion } = await supabase
      .from('suscripciones')
      .select('*, planes(*)')
      .eq('org_id', profile.org_id)
      .single()

    // Verificar si el trial venció
    if (suscripcion?.estado === 'trial' && suscripcion?.trial_fin) {
      const trialFin = new Date(suscripcion.trial_fin)
      if (new Date() > trialFin) {
        await supabase.from('suscripciones')
          .update({ estado: 'vencida' })
          .eq('id', suscripcion.id)
        return NextResponse.json({ ...suscripcion, estado: 'vencida' })
      }
    }

    return NextResponse.json(suscripcion)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[Suscripcion GET] Error:', message)
    return NextResponse.json({ error: 'Error obteniendo suscripcion' }, { status: 500 })
  }
}

// ── POST: crear suscripción en MP (solo owner) ────────────────────
export async function POST(req: NextRequest) {
  try {
    const { supabase, profile } = await requireRole(['owner'])
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN!

    const { plan_id, payer_email } = await parseBody(req, SuscripcionInputSchema)

    const planConfig = PLANES_MP[plan_id]
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    // 1. Crear plan en MP (si no existe)
    const { data: planDb } = await supabase
      .from('planes').select('mp_plan_id').eq('id', plan_id).single()

    let mpPlanId = planDb?.mp_plan_id

    if (!mpPlanId) {
      const planRes = await fetch(`${MP_BASE}/preapproval_plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
        body: JSON.stringify(planConfig),
      })
      const planData = await planRes.json()
      mpPlanId = planData.id

      await supabase.from('planes').update({ mp_plan_id: mpPlanId }).eq('id', plan_id)
    }

    // 2. Crear suscripción del usuario
    const suscRes = await fetch(`${MP_BASE}/preapproval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
      body: JSON.stringify({
        preapproval_plan_id: mpPlanId,
        payer_email,
        back_url: `${appUrl}/dashboard?suscripcion=ok`,
        reason: planConfig.reason,
        external_reference: profile.org_id,
      }),
    })

    const suscData = await suscRes.json()

    if (!suscData.id) {
      console.error('[Suscripcion POST] MP no devolvio id:', suscData.message ?? suscData)
      return NextResponse.json({ error: 'Error creando suscripcion' }, { status: 502 })
    }

    // 3. Guardar en Supabase
    await supabase.from('suscripciones').upsert({
      org_id: profile.org_id,
      plan_id,
      estado: 'trial',
      mp_suscripcion_id: suscData.id,
      mp_payer_id: payer_email,
      trial_fin: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    }, { onConflict: 'org_id' })

    return NextResponse.json({
      ok: true,
      init_point: suscData.init_point,
      suscripcion_id: suscData.id,
    })

  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[Suscripcion POST] Error:', message)
    return NextResponse.json({ error: 'Error creando suscripcion' }, { status: 500 })
  }
}
