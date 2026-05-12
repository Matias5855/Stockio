import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { email, token, role, org_name } = await req.json()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const link = `${appUrl}/invite/${token}`

    const rolesDesc: Record<string, string> = {
      admin: 'Administrador — acceso completo excepto gestión de usuarios',
      vendedor: 'Vendedor — puede registrar ventas y ver inventario',
      repositor: 'Repositor — puede editar el inventario',
    }

    await resend.emails.send({
      from: 'StockFlow <onboarding@resend.dev>',
      to: email,
      subject: `Te invitaron a usar StockFlow en ${org_name}`,
      html: `
        <div style="max-width:520px;margin:40px auto;font-family:sans-serif;">
          <div style="background:#7C6FE0;padding:28px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;">StockFlow</h1>
          </div>
          <div style="background:#fff;padding:32px;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;">
            <h2 style="color:#18181C;margin:0 0 12px;font-size:20px;">¡Te invitaron a unirte!</h2>
            <p style="color:#555;font-size:15px;line-height:1.6;">
              <strong>${org_name}</strong> te invitó a usar StockFlow como <strong>${role}</strong>.
            </p>
            <div style="background:#F5F4FF;border-radius:10px;padding:16px;margin:20px 0;">
              <p style="margin:0;font-size:13px;color:#5B4FD0;font-weight:600;">Tu rol: ${role.charAt(0).toUpperCase() + role.slice(1)}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#666;">${rolesDesc[role] ?? ''}</p>
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}