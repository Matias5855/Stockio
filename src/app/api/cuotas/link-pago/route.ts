import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { cuota_venta_id, cliente_email, monto, descripcion } = await req.json()

    if (!process.env.MP_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'MP_ACCESS_TOKEN no configurado' }, { status: 500 })
    }

    const { data: cuotaPago } = await supabase
      .from('cuota_pagos')
      .select('id, nro_cuota')
      .eq('cuota_venta_id', cuota_venta_id)
      .eq('estado', 'pendiente')
      .order('nro_cuota')
      .limit(1)
      .single()

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items: [{
          title: descripcion,
          quantity: 1,
          unit_price: Number(monto),
          currency_id: 'ARS',
        }],
        payer: { email: cliente_email },
        metadata: {
          tipo: 'cuota_cliente',
          cuota_pago_id: cuotaPago?.id,
          cuota_venta_id,
        },
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/mp`,
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_APP_URL}/cuotas?pago=ok`,
          failure: `${process.env.NEXT_PUBLIC_APP_URL}/cuotas?pago=error`,
        },
        auto_return: 'approved',
      }),
    })

    const data = await res.json()
    console.log('[link-pago] MP response:', JSON.stringify(data))

    if (!data.init_point) {
      return NextResponse.json({ 
        error: `MP Error: ${data.message || data.error || JSON.stringify(data)}` 
      }, { status: 500 })
    }

    return NextResponse.json({ link: data.init_point })
  } catch (err: any) {
    console.error('[link-pago] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}