import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import { parseBody, InvitarEmpleadoInputSchema, ValidationError } from '@/lib/schemas'
import { requireRole, AuthError } from '@/lib/auth/requireUser'
import { from as emailFrom, replyTo } from '@/lib/email'
import InviteEmployeeEmail from '@/emails/InviteEmployeeEmail'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Solo el owner puede invitar empleados — gestionar_usuarios es exclusivo del owner.
    // Si en el futuro queremos que admin tambien pueda, agregar 'admin' al array.
    const { profile } = await requireRole(['owner'])

    const resend = new Resend(process.env.RESEND_API_KEY)

    // Validacion estricta: role contra whitelist, token con regex, email valido
    const { email, token, org_name } = await parseBody(req, InvitarEmpleadoInputSchema)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stockio.com.ar'
    const link = `${appUrl}/invite/${encodeURIComponent(token)}`

    // React Email escapa automaticamente — no necesitamos escapeHtml manual.
    const html = await render(InviteEmployeeEmail({
      orgName: org_name,
      acceptUrl: link,
      expiresAt: '7 días',
    }))

    await resend.emails.send({
      from: emailFrom('Stockio'),
      replyTo: replyTo(),
      to: email,
      subject: `Te invitaron a usar Stockio en ${org_name}`,
      html,
    })

    // profile sin usar todavia — lo dejamos a mano por si en el futuro
    // queremos saber quien invito a quien para logs.
    void profile

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
