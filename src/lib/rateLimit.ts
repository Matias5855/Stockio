/**
 * Rate limiter in-memory por bucket (IP, email, etc).
 *
 * Limitaciones conocidas:
 * - No comparte estado entre instancias serverless (cada fria empieza vacia).
 *   Vercel reusa instancias calientes, asi que mitiga ataques sostenidos
 *   desde una sola IP pero no es una defensa perfecta.
 * - Para algo serio usar Upstash Redis. Esto es la primera capa.
 *
 * Algoritmo: ventana fija. Si en `windowMs` se hicieron mas de `max` requests,
 * se rechaza con 429 y un `retryAfter` en segundos.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

// Cleanup periodico — evita que el Map crezca infinito en una instancia caliente.
let lastCleanup = 0
function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k)
  }
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfter: number }

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
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
