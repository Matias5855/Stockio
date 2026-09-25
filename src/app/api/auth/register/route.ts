import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import { parseBody, RegisterInputSchema, ValidationError } from '@/lib/schemas'
import { rateLimit, getClientIp } from '@/lib/rateLimit'
import { from as emailFrom, replyTo } from '@/lib/email'
import WelcomeEmail from '@/emails/WelcomeEmail'
import { PERMISOS_OWNER } from '@/lib/auth/permisos'
import { reportarFalla } from '@/lib/reportarFalla'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Rate limit por IP: 5 registros cada 10 minutos.
    // Combinado con el captcha de Supabase (si esta activado) evita bots.
    const ip = getClientIp(req)
    const rl = await rateLimit(`register:${ip}`, 5, 10 * 60 * 1000)
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
    //
    // Este error era FATAL y se tragaba. El profile es lo que conecta al
    // usuario con su organizacion: get_org_id() lo lee de ahi. Sin el, la
    // persona puede iniciar sesion pero la app no encuentra su negocio — ve
    // todo vacio, para siempre, sin saber por que. Y como ya existe la cuenta
    // de auth, tampoco puede volver a registrarse con ese email.
    //
    // Se revierte lo creado y se devuelve el error: una cuenta a medias es
    // peor que un registro fallido, porque el registro se puede reintentar.
    const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      org_id: org.id,
      full_name: nombre,
      role: 'owner',
      // Todos los permisos del catálogo (src/lib/auth/permisos.ts). Se importa
      // en vez de listarlos acá para que agregar una clave nueva no deje al
      // dueño sin ese permiso por olvido.
      permisos: PERMISOS_OWNER,
    })

    if (profileErr) {
      reportarFalla('register/crear-perfil', profileErr, { userId, orgId: org.id })
      await supabaseAdmin.from('organizations').delete().eq('id', org.id)
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json(
        { error: 'No pudimos completar el registro. Intentá de nuevo en un momento.' },
        { status: 500 },
      )
    }

    // 4. Crear suscripción trial
    //
    // No es fatal: si falla, la cuenta funciona igual. Pero sin fila de
    // suscripcion el paywall no tiene que leer y el trial no arranca, asi que
    // hay que enterarse. Puede fallar por duplicado si el trigger
    // crear_suscripcion_trial() ya la creo al insertar la organizacion — algo
    // que este insert silencioso venia tapando.
    const trialFin = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    const { error: suscErr } = await supabaseAdmin.from('suscripciones').insert({
      org_id: org.id,
      plan_id: plan,
      estado: 'trial',
      trial_fin: trialFin.toISOString(),
    })
    if (suscErr) reportarFalla('register/crear-trial', suscErr, { orgId: org.id, plan })

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