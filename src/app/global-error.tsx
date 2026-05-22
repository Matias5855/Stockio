'use client'

/**
 * global-error.tsx — error boundary fullscreen del App Router.
 *
 * Atrapa errores no manejados que ocurren en el root layout (cuando incluso
 * el layout falla). Tiene que ser un componente cliente y exportar su propio
 * <html> y <body> porque reemplaza al root layout entero.
 *
 * Tambien reporta el error a Sentry (los errores de Server Components ya los
 * captura `onRequestError` en instrumentation.ts, pero los errores de
 * componentes cliente unhandled se filtran sin esto).
 */

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body style={{
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F0FDFA',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#1C4542',
        padding: 20,
      }}>
        <div style={{
          maxWidth: 480,
          width: '100%',
          background: '#FFFFFF',
          border: '1px solid #CCFBF1',
          borderRadius: 16,
          padding: 36,
          boxShadow: '0 4px 24px rgba(4,47,46,0.08)',
          textAlign: 'center',
        }}>
          <div style={{
            width: 56,
            height: 56,
            margin: '0 auto 16px',
            borderRadius: '50%',
            background: '#FFF1F2',
            color: '#9F1239',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
          }}>
            ⚠
          </div>

          <h1 style={{
            margin: '0 0 8px',
            fontSize: 22,
            fontWeight: 800,
            color: '#042F2E',
            letterSpacing: '-0.02em',
          }}>
            Algo salió mal
          </h1>

          <p style={{
            margin: '0 0 24px',
            fontSize: 14,
            lineHeight: 1.6,
            color: '#1C4542',
          }}>
            Tuvimos un problema cargando esta pantalla. Ya recibimos el reporte
            y lo vamos a revisar. Probá recargar la página.
          </p>

          {error.digest && (
            <p style={{
              margin: '0 0 20px',
              fontSize: 11,
              color: '#6B7280',
              fontFamily: 'ui-monospace, monospace',
            }}>
              Código: {error.digest}
            </p>
          )}

          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#0D9488',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 10,
              padding: '12px 28px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
            }}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  )
}
