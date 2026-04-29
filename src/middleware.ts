// ============================================================
//  STOCKFLOW — Seguridad completa
//  Archivos a crear/reemplazar:
//  1. src/middleware.ts         → auth + CORS + redirect guard
//  2. next.config.js            → headers de seguridad
//  3. supabase SQL              → RLS completo
// ============================================================


// ─────────────────────────────────────────────────────────────
// ARCHIVO 1: src/middleware.ts
// Reemplazá el archivo existente con este contenido completo
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// URLs permitidas para redirección — evita Open Redirect attacks
const ALLOWED_REDIRECT_ORIGINS = [
  'https://stockflow-indol.vercel.app',
  'http://localhost:3000',
]

// Orígenes permitidos para CORS
const ALLOWED_CORS_ORIGINS = [
  'https://stockflow-indol.vercel.app',
  'http://localhost:3000',
]

function isSafeRedirect(url: string, requestUrl: URL): boolean {
  try {
    // Si es relativa (empieza con /), es segura
    if (url.startsWith('/')) return true
    const parsed = new URL(url)
    return ALLOWED_REDIRECT_ORIGINS.includes(parsed.origin)
  } catch {
    return false
  }
}

function addCORSHeaders(response: NextResponse, origin: string | null): NextResponse {
  if (origin && ALLOWED_CORS_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Vary', 'Origin')
  }
  return response
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Previene clickjacking
  response.headers.set('X-Frame-Options', 'DENY')
  // Previene MIME sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')
  // Controla el referrer
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Fuerza HTTPS
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  // Content Security Policy — solo permite recursos del propio dominio y Supabase
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // unsafe-eval requerido por Next.js
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mercadopago.com`,
    "img-src 'self' data: https://*.supabase.co",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '))
  // Permissions Policy — desactiva features del browser que no usamos
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()')
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const origin = request.headers.get('origin')

  // ── Manejar preflight CORS (OPTIONS) ──────────────────────
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 })
    return addCORSHeaders(addSecurityHeaders(response), origin)
  }

  // ── Validar parámetro redirect para evitar Open Redirect ──
  const redirectParam = searchParams.get('redirect') || searchParams.get('next') || searchParams.get('callbackUrl')
  if (redirectParam && !isSafeRedirect(redirectParam, request.nextUrl)) {
    // Redirect malicioso detectado → redirigir al dashboard
    const safeUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(safeUrl)
  }

  // ── Inicializar cliente Supabase ───────────────────────────
  let response = NextResponse.next({ request })

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

  // ── Verificar sesión en el SERVIDOR (no expone datos al cliente) ──
  const { data: { user }, error } = await supabase.auth.getUser()

  // Si hay error de auth, limpiar cookies y redirigir al login
  if (error && !pathname.startsWith('/login') && !pathname.startsWith('/register')) {
    response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('sb-access-token')
    response.cookies.delete('sb-refresh-token')
    return addCORSHeaders(addSecurityHeaders(response), origin)
  }

  const publicPaths = ['/login', '/register']
  const isPublic = publicPaths.some(p => pathname.startsWith(p))
  const isApiWebhook = pathname.startsWith('/api/webhook') // webhooks no requieren auth de usuario

  // Rutas de API protegidas — verificar auth en el servidor
  if (pathname.startsWith('/api/') && !isApiWebhook) {
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // Rutas de app protegidas
  if (!user && !isPublic && !isApiWebhook) {
    const loginUrl = new URL('/login', request.url)
    // Guardar ruta actual para redirigir después del login (solo si es segura)
    if (pathname !== '/') loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Si ya está autenticado, no dejar entrar a login/register
  if (user && isPublic) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return addCORSHeaders(addSecurityHeaders(response), origin)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}