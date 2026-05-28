/**
 * POST /api/empleados/aceptar
 *
 * Endpoint publico (sin sesion) que procesa la aceptacion de una invitacion:
 *  1. Valida el token, que no este expirada ni aceptada
 *  2. Crea el user en Supabase Auth con email + password
 *  3. Crea el profile vinculado a la org de la invitacion con el role correspondiente
 *  4. Marca la invitacion como aceptada
 *
 * Despues el cliente hace signInWithPassword para obtener la sesion.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { parseBody, ValidationError } from '@/lib/schemas'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const AceptarInputSchema = z.object({
  token: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
  password: z.string().min(6).max(72),
  full_name: z.string().trim().min(2).max(80),
})

const PERMISOS_PRESET: Record<string, Record<string, boolean>> = {
  admin: {
    ver_dashboard: true, ver_stock: true, editar_stock: true,
    ver_ventas: true, crear_ventas: true, ver_finanzas: true,
    ver_archivos: true, gestionar_usuarios: false,
  },
  vendedor: {
    ver_dashboard: true, ver_stock: true, editar_stock: false,
    ver_ventas: true, crear_ventas: true, ver_finanzas: false,
    ver_archivos: false, gestionar_usuarios: false,
  },
  repositor: {
    ver_dashboard: true, ver_stock: true, editar_stock: true,
    ver_ventas: false, crear_ventas: false, ver_finanzas: false,
    ver_archivos: false, gestionar_usuarios: false,
  },
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 intentos por IP cada 10 min
    const ip = getClientIp(req)
    const rl = await rateLimit(`aceptar:${ip}`, 5, 10 * 60 * 1000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Esperá unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    const { token, password, full_name } = await parseBody(req, AceptarInputSchema)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. Buscar invitacion
    const { data: invitacion } = await supabase
      .from('invitaciones')
      .select('id, email, role, org_id, accepted, expires_at')
      .eq('token', token)
      .single()

    if (!invitacion) {
      return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
    }
    if (invitacion.accepted) {
      return NextResponse.json({ error: 'Esta invitación ya fue aceptada' }, { status: 400 })
    }
    if (new Date(invitacion.expires_at) < new Date()) {
      return NextResponse.json({ error: 'La invitación expiró' }, { status: 400 })
    }
    if (!['admin', 'vendedor', 'repositor'].includes(invitacion.role)) {
      return NextResponse.json({ error: 'Rol invalido en la invitacion' }, { status: 400 })
    }

    // 2. Verificar que la org siga existiendo (defensa)
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', invitacion.org_id)
      .single()
    if (!org) {
      return NextResponse.json({ error: 'La organización ya no existe' }, { status: 400 })
    }

    // 3. Crear user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: invitacion.email,
      password,
      email_confirm: true,
    })
    if (authErr || !authData.user) {
      const msg = authErr?.message ?? 'Error creando usuario'
      // Si ya existe el user, devolvemos mensaje claro
      if (msg.toLowerCase().includes('already')) {
        return NextResponse.json({
          error: 'Ya existe una cuenta con ese email. Iniciá sesión.',
        }, { status: 400 })
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // 4. Crear profile con role + permisos de la invitacion
    const { error: profileErr } = await supabase.from('profiles').insert({
      id: authData.user.id,
      org_id: invitacion.org_id,
      full_name,
      role: invitacion.role,
      permisos: PERMISOS_PRESET[invitacion.role],
    })
    if (profileErr) {
      console.error('[Aceptar invitacion] profile error:', profileErr)
      // Limpieza: borrar el user que acabamos de crear
      await supabase.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: 'Error creando perfil' }, { status: 500 })
    }

    // 5. Marcar invitacion como aceptada
    await supabase.from('invitaciones')
      .update({ accepted: true, accepted_at: new Date().toISOString() })
      .eq('id', invitacion.id)

    return NextResponse.json({
      ok: true,
      org_id: invitacion.org_id,
      org_name: org.name,
    })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[Aceptar invitacion] Error:', message)
    return NextResponse.json({ error: 'Error procesando la invitación' }, { status: 500 })
  }
}
