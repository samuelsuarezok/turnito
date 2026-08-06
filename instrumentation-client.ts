// Instrumentación del CLIENTE. Corre en el browser antes de que la app se
// vuelva interactiva. En Next 16 no hace falta exportar nada: el código del
// archivo se ejecuta tal cual.
// Ver node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md

import * as Sentry from "@sentry/nextjs";
import { sentryEnabled, sentryOptions } from "@/lib/sentry-options";

if (sentryEnabled) {
  Sentry.init({
    ...sentryOptions,
    // Session Replay apagado a propósito. Graba la pantalla del usuario, y en
    // el panel eso significa grabar nombres y teléfonos de clientes reales.
    // Si algún día se prende, va con maskAllText y bloqueando el panel entero.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Requerido por Sentry para medir navegaciones del App Router.
export const onRouterTransitionStart = sentryEnabled
  ? Sentry.captureRouterTransitionStart
  : undefined;
