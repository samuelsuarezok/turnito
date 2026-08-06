// Instrumentación del SERVIDOR. Next la ejecuta una vez al arrancar la
// instancia, antes de atender el primer request.
// Ver node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md

import type { Instrumentation } from "next";
import { sentryEnabled, sentryOptions } from "@/lib/sentry-options";

export async function register() {
  if (!sentryEnabled) {
    // Sin DSN no inicializamos nada, pero lo decimos una vez para que nadie
    // crea que tiene monitoreo cuando no lo tiene. Ese es exactamente el modo
    // de falla que queremos evitar: creer que estás cubierto y no estarlo.
    console.warn(
      "[sentry] sin NEXT_PUBLIC_SENTRY_DSN — el monitoreo de errores está APAGADO"
    );
    return;
  }

  const Sentry = await import("@sentry/nextjs");
  Sentry.init(sentryOptions);
}

// Next llama a esto con cada error del servidor: Server Components, route
// handlers, todo. Es el enganche que hace que un fallo en /api/book deje de
// morir en los logs de Vercel.
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  if (!sentryEnabled) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
