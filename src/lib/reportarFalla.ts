import * as Sentry from '@sentry/nextjs'

/**
 * Reporta una falla que NADIE va a ver.
 *
 * En el navegador, cuando algo falla se le puede avisar al usuario. En el
 * servidor no hay nadie mirando: un webhook de Mercado Pago o un cron corren
 * solos, y si una escritura falla el efecto aparece dias despues como "este
 * cliente pago y no le anda" o "a este se le corto el acceso sin motivo".
 *
 * Un console.error tampoco alcanza: queda en los logs de Vercel, que se
 * retienen poco y nadie lee salvo que ya sepa que hay un problema. Por eso
 * esto ademas manda el error a Sentry, que ya esta configurado en el proyecto
 * pero hasta ahora solo recibia errores del cliente (global-error.tsx).
 *
 * QUE PASAR EN `datos`: ids, montos, estados — lo necesario para reconstruir
 * que paso. NUNCA tokens, access_token de Mercado Pago, emails completos ni
 * nada de un certificado. El beforeSend de sentry.server.config redacta lo
 * que se cuele, pero no hay que depender de eso.
 */
export function reportarFalla(
  contexto: string,
  error: unknown,
  datos?: Record<string, unknown>,
): void {
  const mensaje =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)

  console.error(`[${contexto}] ${mensaje}`, datos ?? '')

  Sentry.captureException(
    error instanceof Error ? error : new Error(`${contexto}: ${mensaje}`),
    { tags: { contexto }, extra: datos },
  )
}
