/**
 * GET /api/admin/overview
 *
 * Devuelve todos los datos del dashboard de admin en una sola call:
 *  - MRR (suma de planes activos)
 *  - Funnel (registros -> onboarding -> trial -> activa)
 *  - Lista de trials que vencen en los proximos 7 dias
 *  - Lista completa de organizaciones con su estado
 *
 * Solo para profiles.is_site_admin = true.
 */
import { NextResponse } from 'next/server'
import { requireSiteAdmin, AuthError } from '@/lib/auth/requireUser'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Precios en ARS — sincronizar con buildPlanesConfig de /api/suscripcion
const PRECIO_PLAN: Record<string, number> = {
  normal: 14990,
  premium: 24990,
}

export async function GET() {
  try {
    await requireSiteAdmin()
    const admin = createAdminClient()

    // 1. Todas las orgs con su suscripcion (LEFT JOIN para incluir las que aun no la tengan)
    const { data: orgs, error: orgsErr } = await admin
      .from('organizations')
      .select(`
        id, name, created_at, onboarding_completado,
        suscripciones ( plan_id, estado, trial_fin, created_at )
      `)
      .order('created_at', { ascending: false })

    if (orgsErr) throw new Error(orgsErr.message)

    // 2. Total de profiles (para distinguir orgs con multiples users)
    const { count: totalProfiles } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })

    type OrgRow = {
      id: string
      name: string | null
      created_at: string
      onboarding_completado: boolean | null
      suscripciones: Array<{
        plan_id: string | null
        estado: string | null
        trial_fin: string | null
        created_at: string | null
      }>
    }

    const rows = (orgs ?? []) as OrgRow[]

    // 3. MRR + funnel
    let mrr = 0
    let activas = 0
    let trial = 0
    let vencidas = 0
    let canceladas = 0
    let pausadas = 0
    let onboardingCompletado = 0
    const trialesPorVencer: Array<{
      org_id: string
      org_name: string
      plan_id: string
      trial_fin: string
      dias_restantes: number
    }> = []

    const now = Date.now()
    const en7dias = now + 7 * 24 * 3600 * 1000

    for (const o of rows) {
      if (o.onboarding_completado) onboardingCompletado++
      const susc = o.suscripciones?.[0]
      if (!susc) continue

      const estado = susc.estado ?? ''
      if (estado === 'activa') {
        activas++
        const plan = susc.plan_id ?? 'normal'
        mrr += PRECIO_PLAN[plan] ?? 0
      } else if (estado === 'trial') {
        trial++
        if (susc.trial_fin) {
          const fin = new Date(susc.trial_fin).getTime()
          if (fin >= now && fin <= en7dias) {
            const diasRestantes = Math.ceil((fin - now) / (24 * 3600 * 1000))
            trialesPorVencer.push({
              org_id: o.id,
              org_name: o.name ?? '(sin nombre)',
              plan_id: susc.plan_id ?? 'normal',
              trial_fin: susc.trial_fin,
              dias_restantes: diasRestantes,
            })
          }
        }
      } else if (estado === 'vencida') {
        vencidas++
      } else if (estado === 'cancelada') {
        canceladas++
      } else if (estado === 'pausada') {
        pausadas++
      }
    }

    trialesPorVencer.sort((a, b) => a.dias_restantes - b.dias_restantes)

    // 4. Lista completa para la tabla
    const organizaciones = rows.map((o) => {
      const susc = o.suscripciones?.[0]
      return {
        id: o.id,
        name: o.name ?? '(sin nombre)',
        created_at: o.created_at,
        onboarding_completado: !!o.onboarding_completado,
        plan_id: susc?.plan_id ?? null,
        estado: susc?.estado ?? 'sin_suscripcion',
        trial_fin: susc?.trial_fin ?? null,
      }
    })

    return NextResponse.json({
      mrr,
      moneda: 'ARS',
      funnel: {
        total_orgs: rows.length,
        onboarding_completado: onboardingCompletado,
        trial,
        activas,
        vencidas,
        canceladas,
        pausadas,
        total_profiles: totalProfiles ?? 0,
      },
      trialesPorVencer,
      organizaciones,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[admin/overview] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
