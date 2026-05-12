//Inicia el flujo OAuth - redirige al dueño a MP
import { NextRequest, NextResponse } from 'next/server'
import { requireRole, AuthError } from '@/lib/auth/requireUser'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // Solo el owner puede conectar la cuenta MP de la org.
    const { profile } = await requireRole(['owner'])

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.MP_APP_ID!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/mp/callback`,
      state: profile.org_id, // identificar org al volver del callback
    })

    return NextResponse.redirect(
      `https://auth.mercadopago.com/authorization?${params.toString()}`
    )
  } catch (err) {
    if (err instanceof AuthError) {
      // En un GET de redirect, mejor volver al login que devolver JSON
      return NextResponse.redirect(new URL('/login', req.url))
    }
    throw err
  }
}
