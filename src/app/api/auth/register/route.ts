import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { parseBody, RegisterInputSchema, escapeHtml, ValidationError } from '@/lib/schemas'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

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

    // 5. Email de bienvenida con Resend
    const planNombre = plan === 'premium' ? 'StockFlow Premium' : 'StockFlow Normal'
    const trialFinStr = trialFin.toLocaleDateString('es-AR')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    // Escapar todos los strings que vienen del usuario antes de interpolarlos en HTML
    const primerNombreSafe = escapeHtml(nombre.split(' ')[0])
    const negocioSafe = escapeHtml(negocio)

    try {
      await resend.emails.send({
        from: 'StockFlow <onboarding@resend.dev>',
        to: email,
        subject: `¡Bienvenido a StockFlow, ${primerNombreSafe}! 🎉`,
        html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:#7C6FE0;padding:32px 40px;">
      <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.02em;">StockFlow</h1>
      <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px;">Gestión inteligente para tu negocio</p>
    </div>

    <!-- Body -->
    <div style="padding:40px;">
      <h2 style="color:#18181C;margin:0 0 8px;font-size:22px;font-weight:700;">
        ¡Bienvenido, ${primerNombreSafe}! 👋
      </h2>
      <p style="color:#6B6B80;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Tu cuenta para <strong style="color:#18181C;">${negocioSafe}</strong> está lista. Tenés <strong style="color:#7C6FE0;">30 días gratis</strong> para probar todo sin límites.
      </p>

      <!-- Info box -->
      <div style="background:#F5F4FF;border:1px solid #E0DCFF;border-radius:12px;padding:20px;margin-bottom:28px;">
        <p style="margin:0 0 8px;font-size:13px;color:#6B6B80;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Tu plan</p>
        <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#5B4FD0;">${planNombre}</p>
        <p style="margin:0;font-size:13px;color:#6B6B80;">Prueba gratuita hasta el <strong style="color:#18181C;">${trialFinStr}</strong></p>
      </div>

      <!-- Lo que podés hacer -->
      <p style="color:#18181C;font-weight:700;font-size:15px;margin:0 0 14px;">¿Qué podés hacer con StockFlow?</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${[
          ['📦', 'Controlá tu inventario con alertas de stock bajo'],
          ['🧾', 'Registrá ventas y generá facturas PDF'],
          ['💰', 'Seguí tu caja con ingresos y egresos'],
          ['📷', 'Escaneá códigos de barras desde tu celular'],
          ['💳', 'Ofrecé cuotas a tus clientes con Mercado Pago'],
        ].map(([icon, text]) => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#F9F9FB;border-radius:8px;">
            <span style="font-size:20px;">${icon}</span>
            <span style="color:#444;font-size:14px;">${text}</span>
          </div>
        `).join('')}
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:32px 0 24px;">
        <a href="${appUrl}/dashboard" style="display:inline-block;background:#7C6FE0;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;font-size:16px;">
          Ir a mi dashboard →
        </a>
      </div>

      <p style="color:#9898B0;font-size:13px;text-align:center;margin:0;line-height:1.6;">
        ¿Tenés dudas? Respondé este email y te ayudamos.<br>
        <strong style="color:#7C6FE0;">Equipo StockFlow</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#F5F5F7;padding:20px 40px;text-align:center;border-top:1px solid #EBEBEF;">
      <p style="margin:0;font-size:12px;color:#9898B0;">
        © 2025 StockFlow · Hecho en Chaco, Argentina 🇦🇷
      </p>
    </div>
  </div>
</body>
</html>
        `,
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