/**
 * Helper para registrar cambios en la tabla `historial`.
 *
 * Uso desde cualquier hook/page client-side:
 *   await logHistorial({
 *     accion: 'crear',
 *     entidad: 'producto',
 *     entidad_id: producto.id,
 *     descripcion: `Producto "${producto.nombre}" creado`,
 *   })
 *
 * Si falla (red caida, RLS, etc) NO se rompe la mutacion principal — solo
 * loguea el error a consola. El historial es nice-to-have, no critico.
 */
import { createClient } from '@/lib/supabase/client'

export type AccionHistorial =
  | 'crear'
  | 'editar'
  | 'eliminar'
  | 'cobrar'
  | 'cambiar_estado'
  | 'login'

export type EntidadHistorial =
  | 'producto'
  | 'venta'
  | 'cuota_plan'
  | 'cuota_pago'
  | 'movimiento'
  | 'empleado'
  | 'organizacion'

export type LogInput = {
  accion: AccionHistorial
  entidad: EntidadHistorial
  entidad_id?: string | null
  descripcion: string
  metadata?: Record<string, unknown>
}

export async function logHistorial(input: LogInput): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    if (!navigator.onLine) return // offline: no acumulamos para el MVP

    const supabase = createClient()
    const orgId = localStorage.getItem('stk_org_id')
    if (!orgId) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Obtener nombre del usuario una sola vez (cacheo en localStorage)
    let userName = localStorage.getItem('stk_user_name') ?? null
    if (!userName) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      userName = profile?.full_name ?? user.email ?? 'Usuario'
      if (userName) localStorage.setItem('stk_user_name', userName)
    }

    await supabase.from('historial').insert({
      org_id: orgId,
      user_id: user.id,
      user_name: userName,
      accion: input.accion,
      entidad: input.entidad,
      entidad_id: input.entidad_id ?? null,
      descripcion: input.descripcion,
      metadata: input.metadata ?? null,
    })
  } catch (err) {
    // Nice-to-have: no rompemos la mutacion principal si falla el log
    console.warn('[historial] No se pudo registrar:', err)
  }
}
