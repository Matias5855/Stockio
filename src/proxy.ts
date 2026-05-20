import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// CORS: localhost solo en dev. En prod queremos exclusivamente el dominio publico.
// Si en el futuro se agrega un dominio custom, ampliar este array para el branch prod.
const IS_PROD = process.env.NODE_ENV === 'production'
const ALLOWED_ORIGINS = IS_PROD
  ? ['https://stockflow-indol.vercel.app']
  : ['https://stockflow-indol.vercel.app', 'http://localhost:3000']

function isSafeRedirect(url: string): boolean {
  if (url.startsWith('/')) return true
  try {
    const parsed = new URL(url)
    return ALLOWED_ORIGINS.includes(parsed.origin)
  } catch {
    return false
  }
}

function buildCsp(): string {
  // CSP sin nonce — la app usa paginas estaticas (Next.js SSG) y React.CSSProperties
  // inline en todos los componentes. El nonce requiere renderizado dinamico en TODAS
  // las paginas, lo que rompe la hidratacion de las paginas estaticas.
  // TODO (futuro): migrar a force-dynamic + nonce cuando se requiera cumplimiento estricto.
  // Por ahora 'unsafe-inline' es necesario para que Next.js + React funcionen.
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://sdk.mercadopago.com`,
    `style-src 'self' 'unsafe-inline'`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mercadopago.com https://auth.afip.gob.ar`,
    `img-src 'self' data: blob: https://*.supabase.co`,
    `font-src 'self' data:`,
    `frame-src https://www.mercadopago.com.ar https://www.mercadopago.com`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

function addSecurityHeaders(
  response: NextResponse,
  origin: string | null,
): NextResponse {
  // CORS — solo origenes permitidos
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Vary', 'Origin')
  }

  // Seguridad
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy',
    'accelerometer=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  )
  response.headers.set('Content-Security-Policy', buildCsp())

  return response
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const origin = request.headers.get('origin')

  // Preflight CORS
  if (request.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 })
    return addSecurityHeaders(res, origin)
  }

  // Bloquear open redirect
  const redirectParam = searchParams.get('redirect') || searchParams.get('next') || searchParams.get('callbackUrl')
  if (redirectParam && !isSafeRedirect(redirectParam)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        ),
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()

  const publicPaths  = ['/login', '/register', '/invite', '/recuperar', '/terminos', '/privacidad']
  // La landing publica vive en "/" exacto — usuarios logueados son redirigidos
  // a /dashboard desde la propia page server-side, no acá.
  const isLanding    = pathname === '/'
  const isPublic     = publicPaths.some(p => pathname.startsWith(p)) || isLanding
  const isWebhook    = pathname.startsWith('/api/webhook')
  const isCron       = pathname.startsWith('/api/cron')
  const isAsset      = pathname.startsWith('/_next') || pathname.startsWith('/icon') || pathname === '/manifest.json' || pathname === '/sw.js'

  if (isAsset) return addSecurityHeaders(response, origin)

  // Rutas de API protegidas (incluye /api/auth/register que tiene su propio handling pero no requiere user)
  const isAuthPublicApi = pathname.startsWith('/api/auth/register')
  if (pathname.startsWith('/api/') && !isWebhook && !isCron && !isAuthPublicApi && !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // APIs manejan su propia auth — devuelven JSON, nunca redirect (un redirect
  // a /login convertia el POST en GET y devolvia 405 desde la page handler).
  const isApi = pathname.startsWith('/api/')

  // Sesion expirada — limpiar cookies y mandar a login (solo pages)
  if (error && !isPublic && !isApi) {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('sb-access-token')
    res.cookies.delete('sb-refresh-token')
    return addSecurityHeaders(res, origin)
  }

  if (!user && !isPublic && !isApi) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') loginUrl.searchParams.set('redirect', pathname)
    return addSecurityHeaders(NextResponse.redirect(loginUrl), origin)
  }

  if (user && isPublic) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)), origin)
  }

  return addSecurityHeaders(response, origin)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon-.*\\.png|manifest\\.json|sw\\.js).*)',
  ],
}
