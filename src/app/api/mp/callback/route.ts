import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const orgId = searchParams.get('state')

  if (!code || !orgId) {
    return NextResponse.redirect(new URL('/configuracion?mp=error', req.url))
  }

  const supabase = await createServerSupabaseClient()

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
  }).eq('id', orgId)

  return NextResponse.redirect(new URL('/configuracion?mp=ok', req.url))
}