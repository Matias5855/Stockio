import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMember, AuthError } from '@/lib/auth/requireUser'
import { parseBody, QrRapidoInputSchema, ValidationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { supabase, profile } = await requireOrgMember()
    const { monto, descripcion } = await parseBody(req, QrRapidoInputSchema)

    const { data: org } = await supabase
      .from('organizations')
      .select('mp_access_token, mp_connected, name')
      .eq('id', profile.org_id).single()

    // Exigimos la cuenta MP de la PyME — no usamos la de Stockio como fallback,
    // porque entonces el cobro le llegaria al dueno de Stockio, no al cliente.
    if (!org?.mp_connected || !org?.mp_access_token) {
      return NextResponse.json({
        error: 'Mercado Pago no conectado. Entrá a Configuración → Mercado Pago para conectar tu cuenta y empezar a cobrar.',
      }, { status: 400 })
    }
    const accessToken = org.mp_access_token

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
      // No incluir el detalle del error de MP en la respuesta — puede leakear info.
      console.error('[QR rapido] MP no devolvio init_point:', data.message ?? data)
      return NextResponse.json({ error: 'Error generando link de pago' }, { status: 500 })
    }

    return NextResponse.json({ link: data.init_point, preference_id: data.id })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[QR rapido] Error:', message)
    return NextResponse.json({ error: 'Error generando link de pago' }, { status: 500 })
  }
}
