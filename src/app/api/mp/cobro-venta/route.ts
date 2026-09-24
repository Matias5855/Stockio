/**
 * POST /api/mp/cobro-venta
 *
 * Genera un link de pago de Mercado Pago para UNA venta del mostrador. El
 * cliente lo escanea como QR, paga, y el webhook marca la venta como cobrada.
 *
 * Por qué no se reusa /api/mp/qr-rapido: ese endpoint arma un cobro suelto,
 * sin `notification_url` ni `metadata`, así que nadie puede saber después a
 * qué corresponde el pago. Sirve para cobrar cualquier monto a mano, no para
 * cerrar el círculo de una venta.
 *
 * OJO con `external_reference`: NO se usa para el venta_id. El webhook ya lo
 * interpreta como el org_id de un pago de suscripción (ver api/webhook/mp),
 * así que mandarle una venta ahí haría que la trate como una suscripción e
 * inserte basura en `pagos`. La venta viaja en `metadata`, igual que hace el
 * cobro de cuotas con `tipo: 'cuota_cliente'`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMember, AuthError } from '@/lib/auth/requireUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseBody, CobroVentaInputSchema, ValidationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireOrgMember()
    const { venta_id } = await parseBody(req, CobroVentaInputSchema)

    const admin = createAdminClient()

    // La venta se lee del servidor, no del body: el monto a cobrar lo define
    // la venta registrada, no lo que mande el navegador.
    const { data: venta } = await admin
      .from('ventas')
      .select('id, nro_factura, cliente_nombre, total, estado, org_id')
      .eq('id', venta_id)
      .eq('org_id', profile.org_id)
      .single()

    if (!venta) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }
    if (venta.estado === 'cancelada') {
      return NextResponse.json({ error: 'Esa venta está anulada' }, { status: 400 })
    }
    if (venta.estado === 'cobrada') {
      return NextResponse.json({ error: 'Esa venta ya está cobrada' }, { status: 400 })
    }
    if (!venta.total || Number(venta.total) <= 0) {
      return NextResponse.json({ error: 'La venta no tiene monto a cobrar' }, { status: 400 })
    }

    const { data: org } = await admin
      .from('organizations')
      .select('mp_access_token, mp_connected, name')
      .eq('id', profile.org_id)
      .single()

    // Se exige la cuenta de MP de la PyME. Usar la de Stockio como fallback
    // haría que el cobro le llegue al dueño de Stockio, no al del negocio.
    if (!org?.mp_connected || !org?.mp_access_token) {
      return NextResponse.json({
        error: 'Mercado Pago no está conectado. Entrá a Configuración → Mercado Pago.',
      }, { status: 400 })
    }

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${org.mp_access_token}`,
      },
      body: JSON.stringify({
        items: [{
          title: `Venta ${venta.nro_factura}`,
          quantity: 1,
          unit_price: Number(venta.total),
          currency_id: 'ARS',
        }],
        statement_descriptor: org.name ?? 'Mi Negocio',
        metadata: {
          tipo: 'venta_mostrador',
          venta_id: venta.id,
          org_id: profile.org_id,
        },
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/mp`,
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_APP_URL}/ventas?pago=ok`,
          failure: `${process.env.NEXT_PUBLIC_APP_URL}/ventas?pago=error`,
        },
        auto_return: 'approved',
      }),
    })

    const data = await res.json()

    if (!data.init_point) {
      // El detalle de MP no se devuelve al cliente: puede filtrar informacion.
      console.error('[cobro-venta] MP no devolvio init_point:', data.message ?? data)
      return NextResponse.json({ error: 'Error generando el link de pago' }, { status: 502 })
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
    console.error('[cobro-venta] Error:', message)
    return NextResponse.json({ error: 'Error generando el link de pago' }, { status: 500 })
  }
}
