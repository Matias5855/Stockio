import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton: evitar crear multiples clientes en una misma sesion
let browserClient: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return browserClient
}

// Cache en memoria + deduplicacion de llamadas concurrentes
let orgIdCache: string | null = null
let orgIdPromise: Promise<string | null> | null = null

export async function getOrgId(): Promise<string | null> {
  if (orgIdCache) return orgIdCache
  if (orgIdPromise) return orgIdPromise

  orgIdPromise = (async () => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('sf_org_id') : null
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      orgIdCache = cached
      return cached
    }
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        orgIdCache = cached
        return cached
      }

      const { data: profile } = await supabase
        .from('profiles').select('org_id').eq('id', user.id).single()

      if (profile?.org_id) {
        localStorage.setItem('sf_org_id', profile.org_id)
        orgIdCache = profile.org_id

        // No bloquear el retorno con la consulta del nombre de la org
        supabase
          .from('organizations')
          .select('nombre')
          .eq('id', profile.org_id)
          .single()
          .then(({ data: org }) => {
            if (org?.nombre) localStorage.setItem('sf_org_nombre', org.nombre)
          })

        return profile.org_id
      }
    } catch (err) {
      console.warn('[getOrgId] error:', err)
    }

    orgIdCache = cached
    return cached
  })()

  const result = await orgIdPromise
  orgIdPromise = null
  return result
}

// Limpiar cache al cerrar sesion
export function clearOrgIdCache() {
  orgIdCache = null
  orgIdPromise = null
}
