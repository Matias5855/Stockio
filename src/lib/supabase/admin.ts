/**
 * Cliente Supabase con service_role — bypassea RLS.
 *
 * USAR SOLO en server-side (API routes) y SOLO dentro de endpoints que ya
 * validaron permisos con requireSiteAdmin / requireRole. Si esto se filtra
 * al client el atacante puede leer/modificar cualquier tabla sin restriccion.
 */
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Falta configuracion de Supabase service role')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
