/**
 * Helpers de auth para API routes.
 *
 * - requireUser: garantiza sesión válida, retorna { user, supabase }.
 * - requireOrgMember: ademas trae profile (org_id, role) y valida que pertenezca a una org.
 * - requireRole: ademas verifica que el role del profile este en una whitelist.
 *
 * Lanzan AuthError con status HTTP correspondiente. Las routes hacen
 * `try { ... } catch (e) { if (e instanceof AuthError) return NextResponse.json(...) }`.
 */
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

export type AuthedUser = {
  id: string
  email?: string
}

export type Profile = {
  id: string
  org_id: string
  role: string
}

export type AuthContext = {
  user: AuthedUser
  supabase: SupabaseClient
}

export type OrgAuthContext = AuthContext & {
  profile: Profile
}

export async function requireUser(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    throw new AuthError('No autorizado', 401)
  }
  return { user: { id: user.id, email: user.email }, supabase }
}

export async function requireOrgMember(): Promise<OrgAuthContext> {
  const ctx = await requireUser()
  const { data: profile, error } = await ctx.supabase
    .from('profiles')
    .select('id, org_id, role')
    .eq('id', ctx.user.id)
    .single()
  if (error || !profile || !profile.org_id) {
    throw new AuthError('Perfil no encontrado', 403)
  }
  return { ...ctx, profile: profile as Profile }
}

/**
 * Garantiza que el usuario pertenezca a una org Y tenga uno de los roles permitidos.
 * Roles validos en StockFlow: 'owner' | 'admin' | 'vendedor' | 'repositor'
 */
export async function requireRole(allowed: readonly string[]): Promise<OrgAuthContext> {
  const ctx = await requireOrgMember()
  if (!allowed.includes(ctx.profile.role)) {
    throw new AuthError('Permisos insuficientes', 403)
  }
  return ctx
}
