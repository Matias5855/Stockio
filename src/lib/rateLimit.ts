/**
 * Rate limiter con Upstash Redis (distribuido) + fallback in-memory.
 *
 * Estrategia de dos capas:
 *  - Si UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN estan seteados,
 *    usa Upstash sliding window. Esto SI comparte estado entre todas las
 *    instancias serverless de Vercel -> defensa real contra ataques.
 *  - Si NO estan seteados (dev local, o env vars faltantes), o si Upstash
 *    falla (timeout/red), cae al limiter in-memory. Asi nunca bloquea por
 *    un problema de infra y dev funciona sin configurar nada.
 *
 * La funcion es ASYNC (Upstash es por red). Los callers tienen que await.
 *
 * Algoritmo: sliding window. Si en `windowMs` se hicieron mas de `max`
 * requests, se rechaza con un `retryAfter` en segundos.
 */
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfter: number }

// ──────────────────────────────────────────────────────────────
// Capa 1: Upstash (distribuida)
// ──────────────────────────────────────────────────────────────

let redisClient: Redis | null = null
let redisChecked = false

function getRedis(): Redis | null {
  if (redisChecked) return redisClient
  redisChecked = true
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  redisClient = new Redis({ url, token })
  return redisClient
}

// Upstash recomienda reusar instancias de Ratelimit. Cacheamos una por cada
// combinacion unica de (max, windowMs) que usen los routes.
const limiters = new Map<string, Ratelimit>()

function getLimiter(max: number, windowMs: number): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null
  const cacheKey = `${max}:${windowMs}`
  let limiter = limiters.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      // El Duration acepta "<n> ms" como unidad valida.
      limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
      prefix: 'stockio_rl',
      analytics: false,
    })
    limiters.set(cacheKey, limiter)
  }
  return limiter
}

// ──────────────────────────────────────────────────────────────
// Capa 2: in-memory (fallback)
// ──────────────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

let lastCleanup = 0
function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k)
  }
}

function rateLimitInMemory(key: string, max: number, windowMs: number): RateLimitResult {
  cleanup()
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: max - 1 }
  }

  if (bucket.count >= max) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count += 1
  return { ok: true, remaining: max - bucket.count }
}

// ──────────────────────────────────────────────────────────────
// API publica
// ──────────────────────────────────────────────────────────────

export async function rateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const limiter = getLimiter(max, windowMs)

  if (limiter) {
    try {
      const res = await limiter.limit(key)
      if (res.success) {
        return { ok: true, remaining: res.remaining }
      }
      const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
      return { ok: false, retryAfter }
    } catch (err) {
      // Upstash caido / timeout -> no bloqueamos al user por infra. Caemos
      // al limiter in-memory que al menos mitiga desde una instancia caliente.
      console.error('[rateLimit] Upstash fallo, usando fallback in-memory:', err)
      return rateLimitInMemory(key, max, windowMs)
    }
  }

  // Sin Upstash configurado -> in-memory
  return rateLimitInMemory(key, max, windowMs)
}

/**
 * Extrae la IP del request, priorizando headers de Vercel/Cloudflare.
 * Si no hay nada, retorna 'unknown' (todas las requests sin IP comparten bucket).
 */
export function getClientIp(req: Request): string {
  const headers = req.headers
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  const cfIp = headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()
  return 'unknown'
}
