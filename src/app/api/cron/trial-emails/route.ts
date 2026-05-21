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
import { escapeHtml } from '@/lib/schemas'
import { from as emailFrom, replyTo } from '@/lib/email'

export const dynamic = 'force-dynamic'

type AvisoTipo = 'dia23' | 'dia28'

const ASUNTOS: Record<AvisoTipo, string> = {
  dia23: 'Te quedan 7 días de prueba en Stockio 🎁',
  dia28: '⚠ Tu prueba de Stockio termina en 2 días',
}

function buildEmailHtml(opts: {
  tipo: AvisoTipo
  nombre: string
  negocio: string
  trialFinStr: string
  appUrl: string
}): string {
  const { tipo, nombre, negocio, trialFinStr, appUrl } = opts
  const esUrgente = tipo === 'dia28'

  const titulo = esUrgente
    ? '⚠ Tu prueba termina en 2 días'
    : '🎁 Te quedan 7 días de prueba'

  const mensaje = esUrgente
    ? `En 2 días termina tu prueba gratuita. Si tenés tarjeta vinculada, te cobramos automáticamente y seguís sin interrupciones. Si todavía no la pusiste, entrá ahora a configuración para no perder el acceso.`
    : `Te queremos recordar que tu prueba gratuita de Stockio termina el ${trialFinStr}. Si tenés tarjeta vinculada, el cobro es automático. Si no, podés agregarla cuando quieras desde Configuración → Suscripción.`

  const ctaLabel = esUrgente ? 'Agregar tarjeta ahora →' : 'Ir a Stockio →'
  const ctaUrl = `${appUrl}/dashboard`
  const accentColor = esUrgente ? '#DC2626' : '#0D9488'

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0FDFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(4,47,46,0.08);">

    <div style="background:#0D9488;padding:32px 40px;">
      <h1 style="color:#FFFFFF;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.02em;">Stockio</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px;">Gestión inteligente para tu negocio</p>
    </div>

    <div style="padding:40px;">
      <h2 style="color:#042F2E;margin:0 0 8px;font-size:22px;font-weight:700;">${titulo}</h2>
      <p style="color:#1C4542;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Hola <strong>${nombre}</strong>, <br><br>
        ${mensaje}
      </p>

      <div style="background:${esUrgente ? '#FFF1F2' : '#F0FDFA'};border:1px solid ${esUrgente ? '#FECDD3' : '#CCFBF1'};border-radius:12px;padding:18px 22px;margin-bottom:28px;">
        <p style="margin:0 0 4px;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Tu negocio</p>
        <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#042F2E;">${negocio}</p>
        <p style="margin:0;font-size:13px;color:#6B7280;">Prueba gratis hasta el <strong style="color:${accentColor};">${trialFinStr}</strong></p>
      </div>

      <div style="text-align:center;margin:28px 0 24px;">
        <a href="${ctaUrl}" style="display:inline-block;background:${accentColor};color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">
          ${ctaLabel}
        </a>
      </div>

      <p style="color:#6B7280;font-size:13px;text-align:center;margin:0;line-height:1.6;">
        ¿Necesitás ayuda? Respondé este email y te atendemos.<br>
        <strong style="color:#0D9488;">Equipo Stockio</strong>
      </p>
    </div>

    <div style="background:#F0FDFA;padding:20px 40px;text-align:center;border-top:1px solid #CCFBF1;">
      <p style="margin:0;font-size:12px;color:#6B7280;">
        © 2026 Stockio · Hecho en Chaco, Argentina 🇦🇷
      </p>
    </div>
  </div>
</body>
</html>`
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
      const nombre = escapeHtml((ownerData.full_name ?? 'hola').split(' ')[0])
      const negocio = escapeHtml(orgData?.name ?? 'tu negocio')
      const trialFinStr = new Date(s.trial_fin).toLocaleDateString('es-AR')

      await resend.emails.send({
        from: emailFrom('Stockio'),
        replyTo: replyTo(),
        to: email,
        subject: ASUNTOS[tipo],
        html: buildEmailHtml({ tipo, nombre, negocio, trialFinStr, appUrl }),
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

    return NextResponse.json({
      ok: true,
      dia23,
      dia28,
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
