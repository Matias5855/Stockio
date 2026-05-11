'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type AppContextType = {
  orgId: string | null
  orgData: any | null
  userId: string | null
  role: string
  plan: string
  permisos: Record<string, boolean>
  loading: boolean
  refetchOrg: () => void
}

const AppContext = createContext<AppContextType>({
  orgId: null, orgData: null, userId: null,
  role: 'member', plan: 'normal',
  permisos: {}, loading: true,
  refetchOrg: () => {},
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [state, setState] = useState<Omit<AppContextType, 'refetchOrg'>>({
    orgId: null, orgData: null, userId: null,
    role: 'member', plan: 'normal',
    permisos: {}, loading: true,
  })

  const load = useCallback(async () => {
    try {
      // Intentar desde cache primero
      const cachedOrgId = localStorage.getItem('sf_org_id')

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setState(s => ({ ...s, loading: false })); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id, role, permisos')
        .eq('id', user.id).single()

      if (!profile) { setState(s => ({ ...s, loading: false })); return }

      const orgId = profile.org_id
      localStorage.setItem('sf_org_id', orgId)

      const { data: org } = await supabase
        .from('organizations')
        .select('*, suscripciones(plan_id, estado, trial_fin)')
        .eq('id', orgId).single()

      const planId = (org as any)?.suscripciones?.[0]?.plan_id ?? 'normal'

      setState({
        orgId,
        orgData: org,
        userId: user.id,
        role: profile.role,
        plan: planId,
        permisos: profile.permisos ?? {},
        loading: false,
      })
    } catch {
      setState(s => ({ ...s, loading: false }))
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppContext.Provider value={{ ...state, refetchOrg: load }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)