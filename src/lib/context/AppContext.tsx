'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Antes este contexto traía `orgData` con un `select('*')` sobre
 * `organizations` — o sea, dejaba el mp_access_token del negocio en el estado
 * de React de todas las páginas. Y no lo consumía nadie: lo único que se usaba
 * de esa consulta era el plan_id embebido de `suscripciones`. Se sacó.
 */
type AppContextType = {
  orgId: string | null
  userId: string | null
  role: string
  plan: string
  permisos: Record<string, boolean>
  loading: boolean
  refetchOrg: () => void
}

const AppContext = createContext<AppContextType>({
  orgId: null, userId: null,
  role: 'member', plan: 'normal',
  permisos: {}, loading: true,
  refetchOrg: () => {},
})

/**
 * Último perfil conocido, para poder arrancar SIN CONEXIÓN.
 *
 * Sin esto, offline `getUser()` falla, el contexto queda con role 'member' y
 * permisos vacíos, y la app muestra "No tenés permiso" en TODAS las secciones —
 * al dueño incluido. No se notaba porque el service worker no estaba registrado
 * desde abril y la app directamente no abría sin red.
 *
 * Es seguro: los permisos del navegador solo esconden botones. Lo que se haga
 * offline queda en la cola y la base lo vuelve a validar al subir (RLS y las
 * RPC de las fases C1-C3). Un perfil viejo puede, como mucho, mostrar un botón
 * que el servidor después rechaza.
 */
const PERFIL_CACHE_KEY = 'stk_perfil_cache'

type PerfilCache = Pick<AppContextType, 'orgId' | 'userId' | 'role' | 'plan' | 'permisos'>

function guardarPerfil(p: PerfilCache) {
  try { localStorage.setItem(PERFIL_CACHE_KEY, JSON.stringify(p)) } catch {}
}

function leerPerfil(): PerfilCache | null {
  try {
    const raw = localStorage.getItem(PERFIL_CACHE_KEY)
    return raw ? JSON.parse(raw) as PerfilCache : null
  } catch { return null }
}

/** Al cerrar sesión: si en este equipo entra otra cuenta, no hereda permisos. */
export function borrarPerfilCacheado() {
  try { localStorage.removeItem(PERFIL_CACHE_KEY) } catch {}
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [state, setState] = useState<Omit<AppContextType, 'refetchOrg'>>({
    orgId: null, userId: null,
    role: 'member', plan: 'normal',
    permisos: {}, loading: true,
  })

  const load = useCallback(async () => {
    // Sin conexión: el perfil cacheado, pero SOLO si la sesión guardada en este
    // dispositivo es del mismo usuario. getSession() lee local, sin red.
    const usarCache = async (): Promise<boolean> => {
      const cache = leerPerfil()
      if (!cache) return false
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || session.user.id !== cache.userId) return false
      setState({ ...cache, loading: false })
      return true
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (!(await usarCache())) setState(s => ({ ...s, loading: false }))
      return
    }

    try {
      const { data: { user }, error: errUser } = await supabase.auth.getUser()
      // Con wifi sin internet navigator.onLine da true y getUser falla por red.
      if (!user && errUser && /fetch|network/i.test(errUser.message)) {
        if (await usarCache()) return
      }
      if (!user) { setState(s => ({ ...s, loading: false })); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id, role, permisos')
        .eq('id', user.id).single()

      if (!profile) { setState(s => ({ ...s, loading: false })); return }

      const orgId = profile.org_id
      localStorage.setItem('stk_org_id', orgId)

      // Se consulta `suscripciones` directo en vez de embeberla dentro de
      // organizations: es el único dato que se usaba de aquella consulta.
      const { data: suscripcion } = await supabase
        .from('suscripciones')
        .select('plan_id')
        .eq('org_id', orgId).single()

      const planId = (suscripcion as { plan_id?: string } | null)?.plan_id ?? 'normal'

      const perfil: PerfilCache = {
        orgId,
        userId: user.id,
        role: profile.role,
        plan: planId,
        permisos: profile.permisos ?? {},
      }
      guardarPerfil(perfil)
      setState({ ...perfil, loading: false })
    } catch {
      if (!(await usarCache())) setState(s => ({ ...s, loading: false }))
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  return (
    <AppContext.Provider value={{ ...state, refetchOrg: load }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)