"use client";

import { usePathname } from "next/navigation";
import { GoogleAnalytics } from "@next/third-parties/google";

// GA4 manda la URL completa de cada página a Google. En estas rutas la URL
// es un dato sensible: /t/<token> ES la credencial del turno, y /recuperar
// recibe el código del reset de contraseña en la query. Ahí no se carga.
const EXCLUDED_PREFIXES = ["/t/", "/recuperar"];

export default function Analytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  if (EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }
  return <GoogleAnalytics gaId={gaId} />;
}
