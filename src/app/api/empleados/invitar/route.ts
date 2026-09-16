import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import { parseBody, InvitarEmpleadoInputSchema, ValidationError } from '@/lib/schemas'
import { requireRole, AuthError } from '@/lib/auth/requireUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { from as emailFrom, replyTo } from '@/lib/email'
import InviteEmployeeEmail from '@/emails/InviteEmployeeEmail'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Solo el owner puede invitar empleados — gestionar_usuarios es exclusivo del owner.
    // Si en el futuro queremos que admin tambien pueda, agregar 'admin' al array.
    const { profile } = await requireRole(['owner'])

    const resend = new Resend(process.env.RESEND_API_KEY)

    // Validacion estricta: role contra whitelist, email valido
    const { email, role } = await parseBody(req, InvitarEmpleadoInputSchema)

    // La invitacion se crea ACA, no en el navegador. Antes el cliente insertaba
    // la fila y mandaba el token a este endpoint; como la politica de RLS solo
    // pedia misma organizacion, cualquier empleado podia crearse una invitacion
    // con role='admin' y aceptarla desde /invite para volver con mas privilegios.
    // El org_id sale del profile verificado, nunca del body.
    const admin = createAdminClient()

    const { data: invitacion, error: invErr } = await admin
      .from('invitaciones')
      .insert({ org_id: profile.org_id, email, role })
      .select('token')
      .single()

    if (invErr || !invitacion) {
      console.error('[Invitar] No se pudo crear la invitacion:', invErr?.message)
      return NextResponse.json({ error: 'No se pudo crear la invitación' }, { status: 500 })
    }

    // El nombre del negocio tambien sale de la base: el del body era
    // cosmetico pero lo elegia el cliente, y termina dentro de un email.
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', profile.org_id)
      .single()

    const org_name = (org?.name as string | undefined) ?? 'Tu negocio'
    const token = invitacion.token as string

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
