import { NextRequest, NextResponse } from 'next/server'
import { requireRole, AuthError } from '@/lib/auth/requireUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { reportarFalla } from '@/lib/reportarFalla'

// Los secretos del negocio (mp_access_token, certificados de ARCA) ya no son
// legibles con el cliente del usuario: se les revoco el SELECT sobre esas
// columnas (ver db/rls_fase_b3_secretos.sql). Esta ruta los necesita de
// verdad, asi que usa service_role — DESPUES de validar el rol arriba, y
// filtrando siempre por el org_id del profile verificado, nunca del body.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // Solo el owner puede completar la conexion MP de su org.
    // Ademas comparamos el orgId del state contra el del profile para evitar
    // que un owner de org A complete el flujo con state apuntando a org B.
    const { profile } = await requireRole(['owner'])

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

    const { error: errToken } = await createAdminClient().from('organizations').update({
      mp_access_token: tokenData.access_token,
      mp_refresh_token: tokenData.refresh_token,
      mp_user_id: String(tokenData.user_id),
      mp_connected: true,
    }).eq('id', profile.org_id)

    // Sin esto el usuario volvia a Configuracion con un "conectado" que era
    // mentira: el token no se guardo y cualquier cobro posterior falla. El
    // token NO va en el reporte, solo el org_id.
    if (errToken) {
      reportarFalla('mp-callback/guardar-token', errToken, { orgId: profile.org_id })
      return NextResponse.redirect(new URL('/configuracion?mp=error', req.url))
    }

    return NextResponse.redirect(new URL('/configuracion?mp=ok', req.url))
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    console.error('[MP callback] Error:', err)
    return NextResponse.redirect(new URL('/configuracion?mp=error', req.url))
  }
}
