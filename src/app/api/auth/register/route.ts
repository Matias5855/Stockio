import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import { parseBody, RegisterInputSchema, ValidationError } from '@/lib/schemas'
import { rateLimit, getClientIp } from '@/lib/rateLimit'
import { from as emailFrom, replyTo } from '@/lib/email'
import WelcomeEmail from '@/emails/WelcomeEmail'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Rate limit por IP: 5 registros cada 10 minutos.
    // Combinado con el captcha de Supabase (si esta activado) evita bots.
    const ip = getClientIp(req)
    const rl = rateLimit(`register:${ip}`, 5, 10 * 60 * 1000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Esperá unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }
    // Lazy init: evita errores en build cuando las env vars no estan disponibles
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const resend = new Resend(process.env.RESEND_API_KEY)

    // Validacion con Zod: rechaza body invalido con mensaje claro
    const { nombre, negocio, email, password, plan } = await parseBody(req, RegisterInputSchema)

    // 1. Crear usuario
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

    const userId = authData.user.id
    const slug = `${negocio.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`

    // 2. Crear organización
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .insert({ name: negocio, slug, plan })
      .select().single()
    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 400 })

    // 3. Crear perfil
    await supabaseAdmin.from('profiles').insert({
      id: userId,
      org_id: org.id,
      full_name: nombre,
      role: 'owner',
      permisos: {
        ver_dashboard: true, ver_stock: true, ver_ventas: true,
        crear_ventas: true, editar_stock: true, ver_finanzas: true,
        ver_archivos: true, gestionar_usuarios: true,
      },
    })

    // 4. Crear suscripción trial
    const trialFin = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    await supabaseAdmin.from('suscripciones').insert({
      org_id: org.id,
      plan_id: plan,
      estado: 'trial',
      trial_fin: trialFin.toISOString(),
    })

    // 5. Email de bienvenida con Resend + React Email
    // React Email escapa automaticamente el contenido de strings interpolados,
    // asi que ya no es necesario el escapeHtml manual.
    const primerNombre = nombre.split(' ')[0]
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stockio.com.ar'

    try {
      const html = await render(WelcomeEmail({
        nombre: primerNombre,
        negocio,
        appUrl,
      }))

      await resend.emails.send({
        from: emailFrom('Stockio'),
        replyTo: replyTo(),
        to: email,
        subject: `¡Bienvenido a Stockio, ${primerNombre}! 🎉`,
        html,
      })
    } catch (emailErr) {
      // Si falla el email, no interrumpir el registro
      console.error('[Register] Error enviando email:', emailErr)
    }

    return NextResponse.json({ ok: true, org_id: org.id, org_name: org.name })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[Register] Error:', message)
    return NextResponse.json({ error: 'Error procesando el registro' }, { status: 500 })
  }
}