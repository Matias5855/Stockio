/**
 * Guard server-side del panel /admin.
 *
 * Lee profiles.is_site_admin del user logueado. Si no es admin, redirect
 * a /dashboard. Si no esta logueado, proxy.ts ya lo manda a /login antes
 * de llegar aca.
 *
 * Esto se ejecuta en cada request a /admin/* por ser un layout server.
 */
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_site_admin')
    .eq('id', user.id)
    .single()

  if (!profile || profile.is_site_admin !== true) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
