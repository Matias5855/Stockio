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
type EliminarBody = { action: 'eliminar_organizacion'; org_id: string; confirm_name: string }
type ActionBody = ExtenderTrialBody | CambiarPlanBody | CancelarBody | EliminarBody

// Tablas con FK a organizations.id. El orden importa: primero hijas, despues
// padres. Si en el futuro se agrega una tabla mas, agregarla aca.
// Las que dependen de ventas (venta_items, cuota_pagos) las borramos antes
// que ventas/cuotas_ventas porque el FK es a esas, no a org_id directo.
const TABLAS_DEPENDIENTES_DE_VENTAS = ['venta_items'] as const
const TABLAS_DEPENDIENTES_DE_CUOTAS = ['cuota_pagos'] as const
const TABLAS_CON_ORG_ID = [
  'ventas',
  'cuotas_ventas',
  'productos',
  'movimientos',
  'archivos',
  'historial',
  'invitaciones',
  'notificaciones',
  'suscripciones',
  'profiles',  // Esto desvincula al user de la org, pero NO borra auth.users
] as const

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

    if (body.action === 'eliminar_organizacion') {
      // Guard fuerte: el cliente tiene que mandar el name exacto de la org.
      // Esto evita borrados accidentales con el wrong org_id.
      const { data: org, error: getErr } = await admin
        .from('organizations').select('id, name').eq('id', body.org_id).single()
      if (getErr || !org) {
        return NextResponse.json({ error: 'Organizacion no encontrada' }, { status: 404 })
      }
      if ((org.name ?? '') !== body.confirm_name) {
        return NextResponse.json({
          error: 'El nombre de confirmacion no coincide con el de la organizacion',
        }, { status: 400 })
      }

      const errores: string[] = []

      // 1. Borrar venta_items asociadas a ventas de esta org
      // Hacemos un select primero porque venta_items no tiene org_id directo.
      const { data: ventasIds } = await admin
        .from('ventas').select('id').eq('org_id', body.org_id)
      const ventaIdList = (ventasIds ?? []).map((v: { id: string }) => v.id)
      if (ventaIdList.length > 0) {
        for (const tabla of TABLAS_DEPENDIENTES_DE_VENTAS) {
          const { error } = await admin.from(tabla).delete().in('venta_id', ventaIdList)
          if (error && !error.message.includes('does not exist')) {
            errores.push(`${tabla}: ${error.message}`)
          }
        }
      }

      // 2. Idem cuota_pagos
      const { data: cuotasIds } = await admin
        .from('cuotas_ventas').select('id').eq('org_id', body.org_id)
      const cuotaIdList = (cuotasIds ?? []).map((c: { id: string }) => c.id)
      if (cuotaIdList.length > 0) {
        for (const tabla of TABLAS_DEPENDIENTES_DE_CUOTAS) {
          const { error } = await admin.from(tabla).delete().in('cuota_id', cuotaIdList)
          if (error && !error.message.includes('does not exist')) {
            errores.push(`${tabla}: ${error.message}`)
          }
        }
      }

      // 3. Borrar todas las tablas con org_id directo
      // Si alguna tabla no existe (ej: notificaciones no implementada), no abortamos.
      for (const tabla of TABLAS_CON_ORG_ID) {
        const { error } = await admin.from(tabla).delete().eq('org_id', body.org_id)
        if (error && !error.message.includes('does not exist')) {
          errores.push(`${tabla}: ${error.message}`)
        }
      }

      // 4. Borrar la organization
      const { error: orgErr } = await admin.from('organizations').delete().eq('id', body.org_id)
      if (orgErr) {
        return NextResponse.json({
          error: `No se pudo borrar la org: ${orgErr.message}. Errores previos: ${errores.join('; ')}`,
        }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        warnings: errores.length > 0 ? errores : undefined,
      })
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
