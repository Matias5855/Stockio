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

function generateNonce(): string {
  // Edge runtime: crypto global esta disponible
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  // base64 sin importar Buffer (Edge no garantiza Node Buffer global)
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin)
}

function buildCsp(nonce: string): string {
  // Notas de decisiones:
  // - 'unsafe-eval' solo en dev (React lo usa para reconstruir stacks).
  // - 'wasm-unsafe-eval' necesario en prod por el escaner de codigo de barras
  //   (@undecaf/zbar-wasm carga WebAssembly).
  // - style-src mantiene 'unsafe-inline' porque toda la app usa React.CSSProperties
  //   inline en cada componente — moverlo a CSS externo seria un rediseno total
  //   y los inline styles no son una via de XSS si los valores estan escapados.
  // - 'strict-dynamic' hace que el nonce confie en scripts cargados por scripts ya
  //   confiables, dejando obsoletas las whitelists tipo https://sdk.mercadopago.com
  //   (el sdk de MP se carga via componente con nonce desde la app).
  const scriptSrc = [
    `'self'`,
    `'nonce-${nonce}'`,
    `'strict-dynamic'`,
    `'wasm-unsafe-eval'`,
    // Fallback para navegadores que no soportan strict-dynamic
    `https://sdk.mercadopago.com`,
    IS_PROD ? '' : `'unsafe-eval'`,
  ].filter(Boolean).join(' ')

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
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
  nonce: string
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
  response.headers.set('Content-Security-Policy', buildCsp(nonce))

  return response
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const origin = request.headers.get('origin')
  const nonce = generateNonce()

  // Preflight CORS
  if (request.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 })
    return addSecurityHeaders(res, origin, nonce)
  }

  // Bloquear open redirect
  const redirectParam = searchParams.get('redirect') || searchParams.get('next') || searchParams.get('callbackUrl')
  if (redirectParam && !isSafeRedirect(redirectParam)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Pasar el nonce a Next via header del request para que lo inyecte en sus scripts
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

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

  const publicPaths  = ['/login', '/register']
  const isPublic     = publicPaths.some(p => pathname.startsWith(p))
  const isWebhook    = pathname.startsWith('/api/webhook')
  const isAsset      = pathname.startsWith('/_next') || pathname.startsWith('/icon') || pathname === '/manifest.json' || pathname === '/sw.js'

  if (isAsset) return addSecurityHeaders(response, origin, nonce)

  // Rutas de API protegidas (incluye /api/auth/register que tiene su propio handling pero no requiere user)
  const isAuthPublicApi = pathname.startsWith('/api/auth/register')
  if (pathname.startsWith('/api/') && !isWebhook && !isAuthPublicApi && !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Sesion expirada — limpiar cookies
  if (error && !isPublic) {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('sb-access-token')
    res.cookies.delete('sb-refresh-token')
    return addSecurityHeaders(res, origin, nonce)
  }

  if (!user && !isPublic && !isWebhook && !isAuthPublicApi) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') loginUrl.searchParams.set('redirect', pathname)
    return addSecurityHeaders(NextResponse.redirect(loginUrl), origin, nonce)
  }

  if (user && isPublic) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)), origin, nonce)
  }

  return addSecurityHeaders(response, origin, nonce)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon-.*\\.png|manifest\\.json|sw\\.js).*)',
  ],
}
