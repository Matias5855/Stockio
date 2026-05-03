import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { monto, descripcion } = await req.json()

    const { data: profile } = await supabase
      .from('profiles').select('org_id').eq('id', user.id).single()

    const { data: org } = await supabase
      .from('organizations')
      .select('mp_access_token, mp_connected, name')
      .eq('id', profile?.org_id).single()

    const accessToken = org?.mp_connected && org?.mp_access_token
      ? org.mp_access_token
      : process.env.MP_ACCESS_TOKEN

    if (!accessToken) {
      return NextResponse.json({ error: 'Mercado Pago no configurado' }, { status: 400 })
    }

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        items: [{
          title: descripcion,
          quantity: 1,
          unit_price: Number(monto),
          currency_id: 'ARS',
        }],
        statement_descriptor: org?.name ?? 'Mi Negocio',
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_APP_URL}/configuracion?pago=ok`,
          failure: `${process.env.NEXT_PUBLIC_APP_URL}/configuracion?pago=error`,
        },
        auto_return: 'approved',
      }),
    })

    const data = await res.json()

    if (!data.init_point) {
      return NextResponse.json({ error: data.message ?? 'Error MP' }, { status: 500 })
    }

    return NextResponse.json({ link: data.init_point, preference_id: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}