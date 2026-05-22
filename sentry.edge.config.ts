// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { redactSensitive } from "@/lib/sentry-redact";

Sentry.init({
  dsn: "https://26fd059dac35148777809c43188a7a40@o4511430892650496.ingest.us.sentry.io/4511430905692160",

  // En produccion bajamos el sampling a 10% para no quemar cuota mensual.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // No mandar headers/cookies/IPs por defecto — el edge runtime tambien
  // ve los Bearer tokens de Supabase. El beforeSend de abajo redacta extra.
  sendDefaultPii: false,

  beforeSend: redactSensitive,

  enabled: process.env.NODE_ENV === "production",
});
