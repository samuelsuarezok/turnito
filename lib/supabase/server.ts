import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para rutas de API, con la SESIÓN del que hace el request.
 *
 * No confundir con createAdminClient(): ese usa la service role key, saltea RLS
 * y no sabe quién es el usuario. Este sirve justo para lo contrario — averiguar
 * QUIÉN está pidiendo algo antes de dejarlo hacerlo.
 *
 * `setAll` es un no-op a propósito. supabase-js, si encuentra el access token
 * vencido, lo renueva y quiere escribir las cookies nuevas; en una ruta que sólo
 * lee la identidad y responde, esa escritura no tiene a dónde ir. El request
 * igual funciona (la sesión renovada vive en memoria lo que dura la llamada) y
 * el browser se reacomoda solo en la próxima navegación.
 */
export async function createSessionClient() {
  // En Next 16 `cookies()` es asíncrona.
  const store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: () => {},
      },
    }
  );
}
