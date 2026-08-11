import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * El negocio contra el que corren los tests.
 *
 * NO se hardcodea el slug a propósito. Antes los specs buscaban
 * `slug = "barberia-samuel"` y el día que el negocio se renombró, seis se
 * cayeron todos juntos con un `Cannot read properties of null` que no decía
 * nada. Y no fue casualidad: el producto TIENE una feature para cambiar el
 * slug (ver 0012_cambiar_slug.sql), así que va a volver a pasar.
 *
 * Hoy hay un solo negocio en la base, así que tomamos el primero. Si algún día
 * hay varios, esto es lo único que hay que cambiar.
 */
export async function getNegocio(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("businesses")
    .select("id, slug, name")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`no encontré ningún negocio en la base: ${error?.message ?? "sin filas"}`);
  }
  return data as { id: string; slug: string; name: string };
}

/** El primer servicio activo del negocio. */
export async function getServicio(admin: SupabaseClient, businessId: string) {
  const { data, error } = await admin
    .from("services")
    .select("id, name, duration_min")
    .eq("business_id", businessId)
    .eq("active", true)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`el negocio no tiene servicios activos: ${error?.message ?? "sin filas"}`);
  }
  return data as { id: string; name: string; duration_min: number };
}
