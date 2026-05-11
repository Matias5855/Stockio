import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Obtener orgId — con cache local para offline
export async function getOrgId(): Promise<string | null> {
  // Primero intentar desde cache local
  const cached = localStorage.getItem('sf_org_id')
  if (!navigator.onLine) return cached
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return cached
    
    const { data: profile } = await supabase
      .from('profiles').select('org_id').eq('id', user.id).single()
    
    if (profile?.org_id) {
      localStorage.setItem('sf_org_id', profile.org_id)
      // Guardar nombre del negocio
      const { data: org } = await supabase
        .from('organizations')
        .select('nombre')
        .eq('id', profile.org_id)
        .single()
      if (org?.nombre) localStorage.setItem('sf_org_nombre', org.nombre)
      return profile.org_id
    }
  } catch {}
  
  return cached
}