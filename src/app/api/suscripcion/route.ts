// POST /api/suscripcion — Crea suscripción en Mercado Pago
// GET  /api/suscripcion — Obtiene estado actual del plan

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const MP_BASE = 'https://api.mercadopago.com'
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN!

const PLANES_MP = {
  pro: {
    reason: 'StockFlow Pro',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 9990,
      currency_id: 'ARS',
      free_trial: { frequency: 1, frequency_type: 'months' }, // 30 días gratis
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

// ── GET: obtener estado del plan actual ──────────────────────
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('org_id').eq('id', user.id).single()

    const { data: suscripcion } = await supabase
      .from('suscripciones')
      .select('*, planes(*)')
      .eq('org_id', profile?.org_id)
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST: crear suscripción en MP ────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { plan_id, payer_email } = await req.json()

    if (!['pro', 'business'].includes(plan_id)) {
      return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles').select('org_id, organizations(name)').eq('id', user.id).single()

    const planConfig = PLANES_MP[plan_id as 'pro' | 'business']
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
        external_reference: profile?.org_id, // Para identificar en el webhook
      }),
    })

    const suscData = await suscRes.json()

    if (!suscData.id) {
      throw new Error(suscData.message ?? 'Error creando suscripción en MP')
    }

    // 3. Guardar en Supabase
    await supabase.from('suscripciones').upsert({
      org_id: profile?.org_id,
      plan_id,
      estado: 'trial',
      mp_suscripcion_id: suscData.id,
      mp_payer_id: payer_email,
      trial_fin: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    }, { onConflict: 'org_id' })

    // 4. Devolver la URL de pago de MP para redirigir al usuario
    return NextResponse.json({
      ok: true,
      init_point: suscData.init_point, // URL donde el usuario ingresa su tarjeta
      suscripcion_id: suscData.id,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}