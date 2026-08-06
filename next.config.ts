import type { NextConfig } from "next";

// Headers de seguridad. Se aplican a TODA la app (source: "/:path*").
//
// Criterio: acá va solo lo que no puede romper nada. El Content-Security-Policy
// NO está — ver la nota al final del archivo, no es un olvido.
const securityHeaders = [
  // Clickjacking: nadie puede meter la app en un <iframe>. Sin esto, alguien
  // monta un sitio con Turnito embebido e invisible encima de otra cosa, y el
  // usuario termina apretando "Cancelar turno" creyendo que aprieta otro botón.
  { key: "X-Frame-Options", value: "DENY" },

  // El browser respeta el Content-Type que mandamos en vez de adivinarlo.
  // Corta el vector de "subo un .txt que el browser decide ejecutar como JS".
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Al salir del sitio mandamos solo el origen, nunca la URL completa. Importa
  // acá: las URLs tienen datos: /t/<token> ES la credencial del turno, y
  // /<slug> identifica al negocio. Sin esto se filtran por el header Referer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // No usamos ninguna de estas APIs. Declararlo apagado evita que un script
  // de terceros las pida a nuestro nombre.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },

  // HSTS: el browser recuerda que este dominio es HTTPS y no intenta HTTP.
  //
  // OJO, es PEGAJOSO: el browser lo cachea 2 años. Si algún día necesitás
  // servir algo por HTTP en este dominio, no vas a poder hasta que expire.
  // En Vercel es seguro (HTTPS siempre).
  //
  // NO le pusimos `preload` a propósito: eso te mete en una lista de Chrome de
  // la que salir tarda MESES. Es un camino de ida, y para el tamaño de hoy no
  // hace falta.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Saca el header `X-Powered-By: Next.js`. No es una vulnerabilidad, pero no
  // hay razón para anunciar el stack y la versión que corremos.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ NO HAY Content-Security-Policy TODAVÍA
//
// Es el header que más suma, y también el único que puede romper la app entera.
// Un CSP estricto choca hoy con dos cosas reales de este proyecto:
//
//   1. framer-motion escribe estilos inline → necesita 'unsafe-inline' en
//      style-src, o migrar a nonces.
//   2. Next inyecta scripts inline para hidratar → necesita nonce por request,
//      lo que obliga a generarlo en proxy.ts y pasarlo a cada respuesta.
//
// Un CSP con 'unsafe-inline' en script-src no protege de nada: es un header
// para mostrar en una auditoría. O se hace con nonces y se prueba, o no se hace.
//
// Cuando se encare, el orden correcto es:
//   1. Arrancar con Content-Security-Policy-Report-Only (no bloquea, solo avisa)
//   2. Navegar la app entera y juntar las violaciones
//   3. Recién ahí pasarlo a modo bloqueo
//
// Guía de Next para esto: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
// ─────────────────────────────────────────────────────────────────────────────
