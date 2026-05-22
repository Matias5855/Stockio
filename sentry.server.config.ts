// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { redactSensitive } from "@/lib/sentry-redact";

Sentry.init({
  dsn: "https://26fd059dac35148777809c43188a7a40@o4511430892650496.ingest.us.sentry.io/4511430905692160",

  // En produccion bajamos el sampling a 10% para no quemar la cuota mensual.
  // En dev queremos ver todo.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Sentry "PII" incluye headers de auth, cookies, IPs, etc. En Stockio NO los
  // queremos porque los headers de Authorization llevan tokens de Supabase / MP.
  // El beforeSend abajo redacta lo que se cuele igual.
  sendDefaultPii: false,

  // Filtro de datos sensibles — Mercado Pago tokens, certs ARCA, JWTs, etc.
  beforeSend: redactSensitive,

  // No reportar errores propios del entorno de desarrollo
  enabled: process.env.NODE_ENV === "production",
});
