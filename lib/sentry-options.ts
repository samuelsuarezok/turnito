// Config compartida de Sentry (cliente y servidor).
//
// TODO Sentry queda APAGADO si no hay DSN. Eso es a propósito: en local nadie
// quiere que sus errores de desarrollo se manden a ningún lado, y si alguien
// clona el repo sin configurar nada, la app tiene que arrancar igual.

import type { ErrorEvent } from "@sentry/nextjs";

export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? "";

/** Si no hay DSN, no inicializamos nada. */
export const sentryEnabled = SENTRY_DSN.length > 0;

export const sentryOptions = {
  dsn: SENTRY_DSN,

  // Separa los errores de producción de los de preview/local en el dashboard.
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  // Muestreo de performance. 10% alcanza para ver tendencias sin comerse la
  // cuota del plan gratis. Los ERRORES se mandan siempre, esto es solo trazas.
  tracesSampleRate: 0.1,

  // En dev tiramos los eventos a la consola en vez de mandarlos.
  debug: false,

  // ── PII: lo más importante de este archivo ──────────────────────────────
  //
  // `sendDefaultPii: false` es el default del SDK, pero lo dejamos explícito
  // porque acá importa de verdad: el panel muestra NOMBRES Y TELÉFONOS de
  // clientes. Si esto se prendiera, Sentry se llevaría headers, cookies y
  // cuerpos de request con datos de gente real.
  sendDefaultPii: false,

  // Red de seguridad extra: antes de mandar, limpiamos lo que igual podría
  // colarse por la URL. `/t/<token>` ES la credencial de un turno.
  beforeSend(event: ErrorEvent): ErrorEvent {
    if (event.request?.url) {
      event.request.url = event.request.url.replace(
        /\/t\/[A-Za-z0-9]+/,
        "/t/[token]"
      );
    }
    return event;
  },
};
