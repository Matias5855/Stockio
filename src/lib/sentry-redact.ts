/**
 * Helpers para redactar datos sensibles antes de enviar a Sentry.
 *
 * Stockio maneja:
 *  - Access tokens de Mercado Pago de cada org (APP_USR-...)
 *  - Certificados ARCA encriptados (PEM)
 *  - JWTs de Supabase (sb-access-token, sb-refresh-token)
 *  - Auth tokens de Sentry (sntrys_...)
 *  - Datos fiscales de clientes (CUIT, condicion IVA, IIBB)
 *  - Emails de clientes finales
 *
 * Si Sentry recibe un error con cualquiera de estos en el body/headers/url,
 * quedan visibles en el dashboard de Sentry. Eso es un breach de seguridad.
 *
 * Este modulo expone `redactSensitive(event)` que se llama desde `beforeSend`
 * en los 3 configs de Sentry (client, server, edge).
 */

import type { ErrorEvent, EventHint } from '@sentry/nextjs'

// Patterns de strings que tenemos que redactar donde sea que aparezcan
const SENSITIVE_PATTERNS: ReadonlyArray<RegExp> = [
  // Mercado Pago access tokens (formato: APP_USR-<numeros>-<hex>-<numeros>)
  /APP_USR-[\w-]+/g,
  // JWTs (Supabase, NextAuth, etc.) — formato base64.base64.base64
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,
  // Bloques PEM (certificados/keys ARCA)
  /-----BEGIN [^-]+-----[\s\S]+?-----END [^-]+-----/g,
  // Tokens de Sentry
  /sntrys_[A-Za-z0-9+/=._-]+/g,
  // Service role keys de Supabase (formato: eyJ... pero los JWT ya estan cubiertos)
]

// Headers que siempre redactamos (case-insensitive)
const SENSITIVE_HEADERS: ReadonlyArray<string> = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-supabase-auth',
  'x-mp-access-token',
  'sb-access-token',
  'sb-refresh-token',
]

// Query/body keys que redactamos por nombre (case-insensitive)
const SENSITIVE_KEYS: ReadonlyArray<string> = [
  'password',
  'token',
  'access_token',
  'refresh_token',
  'mp_access_token',
  'mp_refresh_token',
  'auth_token',
  'api_key',
  'secret',
  'private_key',
  'cert',
  'arca_cert',
  'arca_private_key',
]

const REDACTED = '[REDACTED]'

function redactString(s: string): string {
  let result = s
  for (const p of SENSITIVE_PATTERNS) {
    result = result.replace(p, REDACTED)
  }
  return result
}

function redactRecord(record: Record<string, unknown> | undefined): void {
  if (!record) return
  for (const key of Object.keys(record)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_HEADERS.includes(lowerKey) || SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
      record[key] = REDACTED
    } else if (typeof record[key] === 'string') {
      record[key] = redactString(record[key] as string)
    }
  }
}

/**
 * Hook para `beforeSend` de Sentry. Muta el event redactando datos sensibles
 * y lo retorna. Si algo falla en la redaccion, dropea el evento entero
 * (mejor perder el reporte que filtrar un token).
 */
export function redactSensitive(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  try {
    // Headers
    if (event.request?.headers) {
      redactRecord(event.request.headers as Record<string, unknown>)
    }

    // Query string (puede ser string o record)
    if (typeof event.request?.query_string === 'string') {
      event.request.query_string = redactString(event.request.query_string)
    } else if (event.request?.query_string && typeof event.request.query_string === 'object') {
      redactRecord(event.request.query_string as Record<string, unknown>)
    }

    // Body (data)
    if (typeof event.request?.data === 'string') {
      event.request.data = redactString(event.request.data)
    } else if (event.request?.data && typeof event.request.data === 'object') {
      redactRecord(event.request.data as Record<string, unknown>)
    }

    // URL — limpiar query strings con tokens
    if (event.request?.url && typeof event.request.url === 'string') {
      event.request.url = redactString(event.request.url)
    }

    // Mensaje principal del error
    if (event.message) {
      event.message = redactString(event.message)
    }

    // Exception values (mensaje del Error.message)
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value) ex.value = redactString(ex.value)
      }
    }

    // Breadcrumbs (cada uno puede tener message/data)
    if (event.breadcrumbs) {
      for (const bc of event.breadcrumbs) {
        if (bc.message) bc.message = redactString(bc.message)
        if (bc.data && typeof bc.data === 'object') {
          redactRecord(bc.data as Record<string, unknown>)
        }
      }
    }

    return event
  } catch {
    // Si algo en la redaccion explota, dropear el evento entero
    return null
  }
}
