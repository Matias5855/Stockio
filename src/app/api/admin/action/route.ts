/**
 * POST /api/admin/action
 *
 * Endpoint unificado para acciones del panel admin. Body:
 *  { action: 'extender_trial', org_id: string, dias: number }
 *  { action: 'cambiar_plan',  org_id: string, plan_id: 'normal' | 'premium' }
 *  { action: 'cancelar_suscripcion', org_id: string }
 *
 * Todas requieren is_site_admin. Bypassean RLS via service role para poder
 * modificar suscripciones de cualquier org.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSiteAdmin, AuthError } from '@/lib/auth/requireUser'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type ExtenderTrialBody = { action: 'extender_trial'; org_id: string; dias: number }
type CambiarPlanBody = { action: 'cambiar_plan'; org_id: string; plan_id: 'normal' | 'premium' }
type CancelarBody = { action: 'cancelar_suscripcion'; org_id: string }
type ActionBody = ExtenderTrialBody | CambiarPlanBody | CancelarBody

export async function POST(req: NextRequest) {
  try {
    await requireSiteAdmin()
    const admin = createAdminClient()
    const body = (await req.json()) as ActionBody

    if (!body.org_id) {
      return NextResponse.json({ error: 'org_id requerido' }, { status: 400 })
    }

    if (body.action === 'extender_trial') {
      const dias = Number(body.dias)
      if (!dias || dias < 1 || dias > 365) {
        return NextResponse.json({ error: 'dias invalido (1-365)' }, { status: 400 })
      }

      // Levanta el trial_fin actual (si existe) y le suma dias.
      // Si no hay trial_fin, parte desde hoy.
      const { data: susc } = await admin
        .from('suscripciones').select('trial_fin, estado').eq('org_id', body.org_id).single()

      const base = susc?.trial_fin ? new Date(susc.trial_fin).getTime() : Date.now()
      const trial_fin = new Date(Math.max(base, Date.now()) + dias * 24 * 3600 * 1000).toISOString()

      const { error } = await admin
        .from('suscripciones')
        .update({ trial_fin, estado: 'trial' })  // Si estaba vencida, vuelve a trial
        .eq('org_id', body.org_id)

      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, trial_fin })
    }

    if (body.action === 'cambiar_plan') {
      if (body.plan_id !== 'normal' && body.plan_id !== 'premium') {
        return NextResponse.json({ error: 'plan_id invalido' }, { status: 400 })
      }
      const { error } = await admin
        .from('suscripciones').update({ plan_id: body.plan_id }).eq('org_id', body.org_id)
      if (error) throw new Error(error.message)

      // Tambien actualizo la columna plan en organizations si la usan
      await admin.from('organizations').update({ plan: body.plan_id }).eq('id', body.org_id)

      return NextResponse.json({ ok: true, plan_id: body.plan_id })
    }

    if (body.action === 'cancelar_suscripcion') {
      const { error } = await admin
        .from('suscripciones').update({ estado: 'cancelada' }).eq('org_id', body.org_id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'action no reconocida' }, { status: 400 })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[admin/action] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
