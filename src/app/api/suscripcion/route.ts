// POST /api/suscripcion — Crea suscripción en Mercado Pago
// GET  /api/suscripcion — Obtiene estado actual del plan
//
// Solo el owner puede cambiar el plan de la org. Cualquier miembro puede leer el estado.

import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMember, requireRole, AuthError } from '@/lib/auth/requireUser'
import { parseBody, SuscripcionInputSchema, ValidationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

const MP_BASE = 'https://api.mercadopago.com'

// Los planes MP requieren back_url cuando tienen free_trial.
// Lo armamos en runtime con el appUrl correcto.
function buildPlanesConfig(appUrl: string) {
  return {
    pro: {
      reason: 'StockFlow Normal',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 9990,
        currency_id: 'ARS',
        free_trial: { frequency: 1, frequency_type: 'months' },
      },
      back_url: `${appUrl}/dashboard?suscripcion=ok`,
    },
    business: {
      reason: 'StockFlow Premium',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 19990,
        currency_id: 'ARS',
        free_trial: { frequency: 1, frequency_type: 'months' },
      },
      back_url: `${appUrl}/dashboard?suscripcion=ok`,
    },
  } as const
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
    const { supabase, profile, user } = await requireRole(['owner'])
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN

    if (!ACCESS_TOKEN) {
      return NextResponse.json({
        error: 'Mercado Pago no esta configurado en el servidor (falta MP_ACCESS_TOKEN).',
      }, { status: 503 })
    }

    const { plan_id, payer_email: bodyEmail } = await parseBody(req, SuscripcionInputSchema)
    // Si el cliente no manda email, usamos el del user logueado
    const payer_email = bodyEmail || user.email
    if (!payer_email) {
      return NextResponse.json({
        error: 'No pudimos obtener tu email. Volve a iniciar sesion e intenta de nuevo.',
      }, { status: 400 })
    }

    // appUrl con fallback al origin del request por si la env var no esta
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
    const planConfig = buildPlanesConfig(appUrl)[plan_id]

    // 1. Crear plan en MP si no existe, o leer su init_point si ya existe.
    // El init_point del PLAN es la URL donde el user pone su tarjeta y MP
    // crea el preapproval automaticamente. Esto reemplaza el flow viejo
    // (POST /preapproval directo) que ahora requiere card_token_id.
    const { data: planDb } = await supabase
      .from('planes').select('mp_plan_id').eq('id', plan_id).single()

    let mpPlanId = planDb?.mp_plan_id
    let planInitPoint: string | null = null

    if (!mpPlanId) {
      const planRes = await fetch(`${MP_BASE}/preapproval_plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
        body: JSON.stringify(planConfig),
      })
      const planData = await planRes.json()
      if (!planData.id) {
        console.error('[Suscripcion POST] MP no creo el plan:', planData)
        return NextResponse.json({
          error: `Mercado Pago: ${planData.cause?.[0]?.description ?? planData.message ?? 'no pudo crear el plan'}`,
        }, { status: 502 })
      }
      mpPlanId = planData.id
      planInitPoint = planData.init_point
      await supabase.from('planes').update({ mp_plan_id: mpPlanId }).eq('id', plan_id)
    } else {
      // Plan ya existe en MP — recuperamos su init_point con GET
      const planRes = await fetch(`${MP_BASE}/preapproval_plan/${mpPlanId}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
      })
      const planData = await planRes.json()
      planInitPoint = planData.init_point
      if (!planInitPoint) {
        console.error('[Suscripcion POST] MP no devolvio init_point del plan existente:', planData)
        // Fallback: invalidamos el mp_plan_id viejo y forzamos recrearlo en el proximo intento
        await supabase.from('planes').update({ mp_plan_id: null }).eq('id', plan_id)
        return NextResponse.json({
          error: 'El plan guardado en Mercado Pago tiene un problema. Volve a intentar y se va a recrear.',
        }, { status: 502 })
      }
    }

    // Defensa: TS no puede inferir que llegamos aca solo si planInitPoint quedo seteado
    if (!planInitPoint) {
      return NextResponse.json({ error: 'No pudimos obtener el link de pago' }, { status: 502 })
    }

    // 2. Anexamos external_reference al init_point para que cuando MP cree
    // el preapproval lo asocie a nuestra org. El webhook se entera y
    // actualiza la fila de suscripciones.
    const initPointConRef = planInitPoint.includes('?')
      ? `${planInitPoint}&external_reference=${encodeURIComponent(profile.org_id)}`
      : `${planInitPoint}?external_reference=${encodeURIComponent(profile.org_id)}`

    // 3. Marcamos la suscripcion como "trial" tentativamente hasta que
    // MP confirme el preapproval via webhook. (Si era 'vencida', vuelve
    // a 'trial' mientras MP procesa.)
    await supabase.from('suscripciones').upsert({
      org_id: profile.org_id,
      plan_id,
      estado: 'trial',
      mp_payer_id: payer_email,
      trial_fin: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    }, { onConflict: 'org_id' })

    return NextResponse.json({
      ok: true,
      init_point: initPointConRef,
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
