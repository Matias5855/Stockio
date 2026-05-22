// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { redactSensitive } from "@/lib/sentry-redact";

Sentry.init({
  dsn: "https://26fd059dac35148777809c43188a7a40@o4511430892650496.ingest.us.sentry.io/4511430905692160",

  // Replay desactivado: el wizard lo prendio con sample 10%, pero por privacidad
  // de los clientes (ven datos de ventas, cuotas, etc.) preferimos NO grabarlo.
  // Si en el futuro queremos, descomentar la linea de integrations y los samples.
  integrations: [
    // Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],

  // 10% sampling en prod para no quemar cuota mensual de Sentry
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enableLogs: true,

  // replaysSessionSampleRate: 0,
  // replaysOnErrorSampleRate: 0,

  // No mandar IPs ni headers automaticamente. El cliente puede igual incluir
  // tokens en URLs/bodies — los redactamos en beforeSend.
  sendDefaultPii: false,

  beforeSend: redactSensitive,

  enabled: process.env.NODE_ENV === "production",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
