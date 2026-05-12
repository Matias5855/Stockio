import { NextRequest, NextResponse } from 'next/server'
import { requireRole, AuthError } from '@/lib/auth/requireUser'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // Solo el owner puede completar la conexion MP de su org.
    // Ademas comparamos el orgId del state contra el del profile para evitar
    // que un owner de org A complete el flujo con state apuntando a org B.
    const { profile, supabase } = await requireRole(['owner'])

    const { searchParams } = req.nextUrl
    const code = searchParams.get('code')
    const stateOrgId = searchParams.get('state')

    if (!code || !stateOrgId) {
      return NextResponse.redirect(new URL('/configuracion?mp=error', req.url))
    }
    if (stateOrgId !== profile.org_id) {
      // state manipulado — abortar
      console.error('[MP callback] state.orgId !== profile.org_id')
      return NextResponse.redirect(new URL('/configuracion?mp=error', req.url))
    }

    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_secret: process.env.MP_ACCESS_TOKEN,
        client_id: process.env.MP_APP_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/mp/callback`,
      }),
    })

    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      return NextResponse.redirect(new URL('/configuracion?mp=error', req.url))
    }

    await supabase.from('organizations').update({
      mp_access_token: tokenData.access_token,
      mp_refresh_token: tokenData.refresh_token,
      mp_user_id: String(tokenData.user_id),
      mp_connected: true,
    }).eq('id', profile.org_id)

    return NextResponse.redirect(new URL('/configuracion?mp=ok', req.url))
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    console.error('[MP callback] Error:', err)
    return NextResponse.redirect(new URL('/configuracion?mp=error', req.url))
  }
}
