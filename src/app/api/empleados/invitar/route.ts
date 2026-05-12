import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { parseBody, InvitarEmpleadoInputSchema, escapeHtml, ValidationError } from '@/lib/schemas'
import { requireRole, AuthError } from '@/lib/auth/requireUser'

export const dynamic = 'force-dynamic'

const ROLES_DESC: Record<string, string> = {
  admin: 'Administrador — acceso completo excepto gestión de usuarios',
  vendedor: 'Vendedor — puede registrar ventas y ver inventario',
  repositor: 'Repositor — puede editar el inventario',
}

export async function POST(req: NextRequest) {
  try {
    // Solo el owner puede invitar empleados — gestionar_usuarios es exclusivo del owner.
    // Si en el futuro queremos que admin tambien pueda, agregar 'admin' al array.
    await requireRole(['owner'])

    const resend = new Resend(process.env.RESEND_API_KEY)

    // Validacion estricta: role contra whitelist, token con regex, email valido
    const { email, token, role, org_name } = await parseBody(req, InvitarEmpleadoInputSchema)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    // token ya pasado por regex en el schema, igual lo encodeamos por las dudas
    const link = `${appUrl}/invite/${encodeURIComponent(token)}`

    // Escapar todo lo que viene del usuario antes de meterlo en HTML
    const orgNameSafe = escapeHtml(org_name)
    const roleSafe = escapeHtml(role)
    const roleCapSafe = escapeHtml(role.charAt(0).toUpperCase() + role.slice(1))
    const roleDescSafe = escapeHtml(ROLES_DESC[role] ?? '')

    await resend.emails.send({
      from: 'StockFlow <onboarding@resend.dev>',
      to: email,
      subject: `Te invitaron a usar StockFlow en ${orgNameSafe}`,
      html: `
        <div style="max-width:520px;margin:40px auto;font-family:sans-serif;">
          <div style="background:#7C6FE0;padding:28px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;">StockFlow</h1>
          </div>
          <div style="background:#fff;padding:32px;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;">
            <h2 style="color:#18181C;margin:0 0 12px;font-size:20px;">¡Te invitaron a unirte!</h2>
            <p style="color:#555;font-size:15px;line-height:1.6;">
              <strong>${orgNameSafe}</strong> te invitó a usar StockFlow como <strong>${roleSafe}</strong>.
            </p>
            <div style="background:#F5F4FF;border-radius:10px;padding:16px;margin:20px 0;">
              <p style="margin:0;font-size:13px;color:#5B4FD0;font-weight:600;">Tu rol: ${roleCapSafe}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#666;">${roleDescSafe}</p>
            </div>
            <a href="${link}" style="display:block;background:#7C6FE0;color:#fff;text-decoration:none;padding:14px;border-radius:10px;text-align:center;font-weight:700;font-size:16px;margin:24px 0;">
              Aceptar invitación →
            </a>
            <p style="color:#999;font-size:12px;text-align:center;">
              Este link expira en 7 días. Si no esperabas esta invitación, ignorá este email.
            </p>
          </div>
        </div>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[Invitar] Error:', message)
    return NextResponse.json({ error: 'Error enviando invitacion' }, { status: 500 })
  }
}
