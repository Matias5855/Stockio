/**
 * POST /api/cron/trial-emails
 *
 * Cron diario (configurado en vercel.json) que envia emails de aviso a los
 * usuarios cuyo trial esta por vencer:
 *
 *  - Dia 23 del trial (7 dias antes de vencer): recordatorio amable.
 *  - Dia 28 del trial (2 dias antes de vencer): aviso urgente.
 *
 * Idempotente: cada suscripcion tiene columnas aviso_dia23_enviado_at y
 * aviso_dia28_enviado_at. Si ya estan llenas no re-envia.
 *
 * Seguridad: protegido con CRON_SECRET en header Authorization. Vercel Cron
 * incluye `Authorization: Bearer ${CRON_SECRET}` automaticamente cuando esta
 * configurado en el dashboard. Sin secret valido, devuelve 401.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import { from as emailFrom, replyTo } from '@/lib/email'
import TrialDay23Email from '@/emails/TrialDay23Email'
import TrialDay28Email from '@/emails/TrialDay28Email'
import TrialExpiredEmail from '@/emails/TrialExpiredEmail'

export const dynamic = 'force-dynamic'

type AvisoTipo = 'dia23' | 'dia28'

const ASUNTOS: Record<AvisoTipo, string> = {
  dia23: 'Te quedan 7 días de prueba en Stockio',
  dia28: 'Tu prueba de Stockio termina en 2 días',
}

// Wrapper que devuelve el HTML segun el tipo. Encapsula la eleccion del
// componente React Email para que procesarAvisos quede limpio.
async function buildEmail(opts: {
  tipo: AvisoTipo
  nombre: string
  negocio: string
  appUrl: string
}): Promise<string> {
  const Component = opts.tipo === 'dia23' ? TrialDay23Email : TrialDay28Email
  return render(Component({
    nombre: opts.nombre,
    negocio: opts.negocio,
    appUrl: opts.appUrl,
  }))
}

// Hace lo mismo para ambos tipos de aviso, parametrizado por tipo y rango de
// dias hasta el vencimiento del trial.
async function procesarAvisos(opts: {
  tipo: AvisoTipo
  diasMin: number
  diasMax: number
  columna: 'aviso_dia23_enviado_at' | 'aviso_dia28_enviado_at'
  supabase: SupabaseClient
  resend: Resend
  appUrl: string
}): Promise<{ enviados: number; fallidos: number }> {
  const { tipo, diasMin, diasMax, columna, supabase, resend, appUrl } = opts

  const now = Date.now()
  const minFecha = new Date(now + diasMin * 24 * 3600 * 1000).toISOString()
  const maxFecha = new Date(now + diasMax * 24 * 3600 * 1000).toISOString()

  const { data: candidatos } = await supabase
    .from('suscripciones')
    .select('id, org_id, trial_fin')
    .eq('estado', 'trial')
    .gte('trial_fin', minFecha)
    .lte('trial_fin', maxFecha)
    .is(columna, null)

  if (!candidatos || candidatos.length === 0) {
    return { enviados: 0, fallidos: 0 }
  }

  let enviados = 0
  let fallidos = 0

  for (const s of candidatos as Array<{ id: string; org_id: string; trial_fin: string }>) {
    try {
      // Datos del negocio
      const { data: org } = await supabase
        .from('organizations').select('name').eq('id', s.org_id).single()

      // Owner de la org (para el nombre)
      const { data: owner } = await supabase
        .from('profiles').select('id, full_name')
        .eq('org_id', s.org_id).eq('role', 'owner').single()

      const ownerData = owner as { id: string; full_name: string | null } | null
      if (!ownerData) { fallidos++; continue }

      // Email del owner (vive en auth.users, no en profiles)
      const { data: userInfo } = await supabase.auth.admin.getUserById(ownerData.id)
      const email = userInfo?.user?.email
      if (!email) { fallidos++; continue }

      const orgData = org as { name: string } | null
      // React Email escapa automaticamente — no necesitamos escapeHtml manual.
      const nombre = (ownerData.full_name ?? 'hola').split(' ')[0]
      const negocio = orgData?.name ?? 'tu negocio'

      const html = await buildEmail({ tipo, nombre, negocio, appUrl })

      await resend.emails.send({
        from: emailFrom('Stockio'),
        replyTo: replyTo(),
        to: email,
        subject: ASUNTOS[tipo],
        html,
      })

      const updatePayload: Record<string, string> = { [columna]: new Date().toISOString() }
      await supabase.from('suscripciones')
        .update(updatePayload)
        .eq('id', s.id)

      enviados++
    } catch (err) {
      console.error(`[Cron trial-emails ${tipo}] Error en suscripcion ${s.id}:`, err)
      fallidos++
    }
  }

  return { enviados, fallidos }
}

// Pasa a estado='vencida' las suscripciones cuyo trial_fin ya paso y aun
// estan en estado='trial', y manda el email TrialExpired. Idempotente via
// aviso_vencido_enviado_at — si la columna no existe, el catch lo absorbe.
async function procesarTrialesVencidos(opts: {
  supabase: SupabaseClient
  resend: Resend
  appUrl: string
}): Promise<{ enviados: number; fallidos: number }> {
  const { supabase, resend, appUrl } = opts
  const ahora = new Date().toISOString()

  let candidatos: Array<{ id: string; org_id: string; trial_fin: string }> = []
  try {
    const { data, error } = await supabase
      .from('suscripciones')
      .select('id, org_id, trial_fin')
      .eq('estado', 'trial')
      .lt('trial_fin', ahora)
      .is('aviso_vencido_enviado_at', null)
    if (error) throw error
    candidatos = (data ?? []) as Array<{ id: string; org_id: string; trial_fin: string }>
  } catch (err) {
    console.warn('[Cron trial-emails vencidos] Skip (columna ausente?):', err)
    return { enviados: 0, fallidos: 0 }
  }

  if (candidatos.length === 0) return { enviados: 0, fallidos: 0 }

  let enviados = 0
  let fallidos = 0

  for (const s of candidatos) {
    try {
      // Marcar vencida antes que nada — si el email falla, igual queda registrado.
      await supabase.from('suscripciones')
        .update({ estado: 'vencida' })
        .eq('id', s.id)

      const { data: org } = await supabase
        .from('organizations').select('name').eq('id', s.org_id).single()
      const { data: owner } = await supabase
        .from('profiles').select('id, full_name')
        .eq('org_id', s.org_id).eq('role', 'owner').single()

      const ownerData = owner as { id: string; full_name: string | null } | null
      if (!ownerData) { fallidos++; continue }

      const { data: userInfo } = await supabase.auth.admin.getUserById(ownerData.id)
      const email = userInfo?.user?.email
      if (!email) { fallidos++; continue }

      const orgData = org as { name: string } | null
      const html = await render(TrialExpiredEmail({
        nombre: (ownerData.full_name ?? 'hola').split(' ')[0],
        negocio: orgData?.name ?? 'tu negocio',
        appUrl,
      }))

      await resend.emails.send({
        from: emailFrom('Stockio'),
        replyTo: replyTo(),
        to: email,
        subject: 'Tu prueba de Stockio terminó',
        html,
      })

      await supabase.from('suscripciones')
        .update({ aviso_vencido_enviado_at: new Date().toISOString() })
        .eq('id', s.id)

      enviados++
    } catch (err) {
      console.error('[Cron trial-emails vencidos] Error:', err)
      fallidos++
    }
  }

  return { enviados, fallidos }
}

export async function POST(req: NextRequest) {
  // Auth: solo Vercel Cron (o requests manuales con el secret correcto)
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const resend = new Resend(process.env.RESEND_API_KEY)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stockio.com.ar'

    // Aviso dia 23: trial_fin entre 6 y 8 dias en el futuro (ventana de tolerancia)
    const dia23 = await procesarAvisos({
      tipo: 'dia23',
      diasMin: 6,
      diasMax: 8,
      columna: 'aviso_dia23_enviado_at',
      supabase, resend, appUrl,
    })

    // Aviso dia 28: trial_fin entre 1 y 3 dias en el futuro
    const dia28 = await procesarAvisos({
      tipo: 'dia28',
      diasMin: 1,
      diasMax: 3,
      columna: 'aviso_dia28_enviado_at',
      supabase, resend, appUrl,
    })

    // Trial vencido: detectamos los que vencieron en las ultimas 24h,
    // los pasamos a estado='vencida' y mandamos el email final.
    // Requiere columna aviso_vencido_enviado_at — si no existe, falla silencioso.
    const vencidos = await procesarTrialesVencidos({ supabase, resend, appUrl })

    return NextResponse.json({
      ok: true,
      dia23,
      dia28,
      vencidos,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[Cron trial-emails] Error:', message)
    return NextResponse.json({ error: 'Error procesando emails' }, { status: 500 })
  }
}

// Permitir GET para que Vercel Cron lo dispare con cualquier metodo
// (algunos schedulers usan GET por default)
export const GET = POST
