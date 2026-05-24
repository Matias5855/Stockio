/**
 * GET /auth/confirm
 *
 * Endpoint que procesa los links de Supabase Auth (recuperar password,
 * confirmar email, magic link, invitaciones, etc.) cuando se usa el flow
 * moderno con token_hash (PKCE-style).
 *
 * Como @supabase/ssr con createBrowserClient usa PKCE por default, los links
 * que manda Supabase NO traen access_token en el fragment (#...) sino un
 * token_hash en query params. Ese token_hash hay que intercambiarlo
 * server-side por una sesion real con verifyOtp(), y recien despues
 * mandar al user al form donde puede cambiar su password.
 *
 * Flow:
 *  1. Supabase envia email con link a /auth/confirm?token_hash=XXX&type=recovery&next=/recuperar/nueva-contrasena
 *  2. User clickea -> llega aca
 *  3. Llamamos a verifyOtp -> Supabase nos da una sesion via cookies
 *  4. Redirect a `next` (con la sesion ya activa)
 *
 * Si el link es invalido/expirado, mandamos a /recuperar con ?error=invalid_link
 * para que el formulario muestre el aviso correspondiente.
 *
 * Cubre: type=recovery (reset password), type=email (confirmar email),
 *        type=magiclink, type=invite, type=email_change.
 */
import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Whitelist de paths a los que aceptamos redirigir despues de verificar.
// Evita open redirects: un atacante no puede mandar a `?next=https://evil.com`.
function isSafeNext(next: string): boolean {
  return next.startsWith('/') && !next.startsWith('//')
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextParam = searchParams.get('next') ?? '/dashboard'
  const next = isSafeNext(nextParam) ? nextParam : '/dashboard'

  // Fallback para links viejos que vengan con ?code= en lugar de token_hash
  const code = searchParams.get('code')

  if (token_hash && type) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      // Sesion creada (Supabase setea las cookies via createServerSupabaseClient).
      // Redirect al destino — el user llega autenticado.
      return NextResponse.redirect(new URL(next, origin))
    }
    console.error('[auth/confirm] verifyOtp error:', error.message)
  } else if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
    console.error('[auth/confirm] exchangeCodeForSession error:', error.message)
  }

  // Link invalido/expirado o sin parametros. Mandamos a /recuperar
  // para que el form le muestre el cartel "link invalido" via query param.
  return NextResponse.redirect(new URL('/recuperar?error=invalid_link', origin))
}
