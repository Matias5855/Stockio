/**
 * Helpers para componer el campo `from` de los emails que mandamos con Resend.
 *
 * Hasta que verifiquemos el dominio stockio.com.ar en Resend, los emails
 * salen de la direccion sandbox `onboarding@resend.dev` (poco profesional,
 * cae mas seguido en spam).
 *
 * Cuando el dominio este verificado:
 *   1. Agregar en Vercel: RESEND_FROM_EMAIL=hola@stockio.com.ar
 *   2. (Opcional) RESEND_REPLY_TO=hola@stockio.com.ar para que las respuestas
 *      lleguen al inbox real.
 *
 * No hace falta tocar codigo — todos los emails leen estas env vars.
 */

const SANDBOX_EMAIL = 'onboarding@resend.dev'

function fromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || SANDBOX_EMAIL
}

/**
 * Compone el campo `from` con un display name custom.
 * @example
 *   from('Stockio')              -> "Stockio <hola@stockio.com.ar>"
 *   from('Indumentaria Matineta') -> "Indumentaria Matineta <hola@stockio.com.ar>"
 */
export function from(displayName: string): string {
  return `${displayName} <${fromEmail()}>`
}

/**
 * Reply-To opcional. Si no esta configurado, devuelve undefined y Resend
 * usa el from como reply-to por default.
 */
export function replyTo(): string | undefined {
  return process.env.RESEND_REPLY_TO || undefined
}

/**
 * `true` cuando todavia estamos en sandbox (sin dominio verificado).
 * Util para warnings en logs.
 */
export function usandoSandbox(): boolean {
  return !process.env.RESEND_FROM_EMAIL
}
