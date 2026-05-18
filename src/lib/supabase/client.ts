import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidUuid } from '@/lib/schemas'

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

/**
 * Lee stk_org_id de localStorage y valida que sea un UUID. Si no lo es
 * (manipulado, corrupto), lo borra y retorna null. Asi evitamos enviar
 * basura al backend en consultas RLS o filtros .eq('org_id', ...).
 */
function readCachedOrgId(): string | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('stk_org_id')
  if (!raw) return null
  if (!isValidUuid(raw)) {
    localStorage.removeItem('stk_org_id')
    return null
  }
  return raw
}

// Cache en memoria + deduplicacion de llamadas concurrentes
let orgIdCache: string | null = null
let orgIdPromise: Promise<string | null> | null = null

export async function getOrgId(): Promise<string | null> {
  if (orgIdCache) return orgIdCache
  if (orgIdPromise) return orgIdPromise

  orgIdPromise = (async () => {
    const cached = readCachedOrgId()
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
        localStorage.setItem('stk_org_id', profile.org_id)
        orgIdCache = profile.org_id

        // No bloquear el retorno con la consulta del nombre de la org
        supabase
          .from('organizations')
          .select('nombre')
          .eq('id', profile.org_id)
          .single()
          .then(({ data: org }) => {
            if (org?.nombre) localStorage.setItem('stk_org_nombre', org.nombre)
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
