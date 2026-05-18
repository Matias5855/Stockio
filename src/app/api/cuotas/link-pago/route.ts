import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMember, AuthError } from '@/lib/auth/requireUser'
import { parseBody, LinkPagoInputSchema, ValidationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { supabase, profile } = await requireOrgMember()

    const { cuota_venta_id, cliente_email, monto, descripcion } =
      await parseBody(req, LinkPagoInputSchema)

    // Verificar que la cuota_venta pertenezca a la org del usuario
    const { data: cuotaVenta } = await supabase
      .from('cuotas_ventas')
      .select('id, org_id')
      .eq('id', cuota_venta_id)
      .single()

    if (!cuotaVenta || cuotaVenta.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })
    }

    // El cobro tiene que ir a la cuenta MP de la PyME, no a la de Stockio.
    // Si no esta conectada, bloqueamos con un mensaje claro.
    const { data: org } = await supabase
      .from('organizations')
      .select('mp_access_token, mp_connected')
      .eq('id', profile.org_id)
      .single()

    if (!org?.mp_connected || !org?.mp_access_token) {
      return NextResponse.json({
        error: 'Mercado Pago no conectado. Entrá a Configuración → Mercado Pago para conectar tu cuenta y empezar a cobrar.',
      }, { status: 400 })
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
        'Authorization': `Bearer ${org.mp_access_token}`,
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

    if (!data.init_point) {
      console.error('[link-pago] MP no devolvio init_point:', data.message ?? data)
      return NextResponse.json({ error: 'Error generando link de pago' }, { status: 502 })
    }

    return NextResponse.json({ link: data.init_point })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[link-pago] Error:', message)
    return NextResponse.json({ error: 'Error generando link de pago' }, { status: 500 })
  }
}
