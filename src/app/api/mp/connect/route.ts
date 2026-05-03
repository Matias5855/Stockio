//Inicia el flujo OAuth - redirige al dueño a MP
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase
    .from('profiles').select('org_id').eq('id', user.id).single()

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.MP_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/mp/callback`,
    state: profile?.org_id ?? '', // Pasamos org_id para identificar al volver
  })

  return NextResponse.redirect(
    `https://auth.mercadopago.com/authorization?${params.toString()}`
  )
}