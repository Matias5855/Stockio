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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [state, setState] = useState<Omit<AppContextType, 'refetchOrg'>>({
    orgId: null, userId: null,
    role: 'member', plan: 'normal',
    permisos: {}, loading: true,
  })

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
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

      setState({
        orgId,
        userId: user.id,
        role: profile.role,
        plan: planId,
        permisos: profile.permisos ?? {},
        loading: false,
      })
    } catch {
      setState(s => ({ ...s, loading: false }))
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