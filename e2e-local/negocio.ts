import { readFileSync } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * El negocio contra el que corren los tests.
 *
 * Se resuelve a partir de la SESIÓN de `.auth.json`, no "el primero de la
 * tabla". Dos motivos, los dos aprendidos a los golpes:
 *
 * 1. El slug no se hardcodea: el producto tiene una feature para cambiarlo
 *    (0012_cambiar_slug.sql). Cuando el negocio se renombró, seis specs se
 *    cayeron juntos con un `Cannot read properties of null`.
 *
 * 2. El negocio tampoco se toma con `.limit(1)`. Ya hay MÁS DE UNO en la base,
 *    y el primero puede no ser el del dueño cuya sesión usan los tests. Cuando
 *    apareció el segundo negocio, cinco specs empezaron a crear turnos en un
 *    negocio y a buscarlos en el panel de otro. Los tests fallaban mientras la
 *    app funcionaba perfecto: era RLS aislando bien.
 *
 * Atándolo a la sesión, el día que se cambie el usuario de `.auth.json` los
 * tests siguen el cambio solos.
 */
function userIdDeLaSesion(): string {
  const raw = readFileSync(path.resolve(__dirname, ".auth.json"), "utf8");
  const cookies = JSON.parse(raw) as { value: string }[];

  // La cookie es "base64-<payload>" y puede venir partida en varias.
  const b64 = cookies.map((c) => c.value).join("").replace(/^base64-/, "");
  const sesion = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));

  const id = sesion?.user?.id;
  if (!id) throw new Error("no pude sacar el user de .auth.json — regenerá con: npm run test:auth -- <email>");
  return id as string;
}

export async function getNegocio(admin: SupabaseClient) {
  const ownerId = userIdDeLaSesion();

  const { data, error } = await admin
    .from("businesses")
    .select("id, slug, name, owner_id")
    .eq("owner_id", ownerId)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(
      `el usuario de .auth.json (${ownerId}) no tiene ningún negocio: ${error?.message ?? "sin filas"}`
    );
  }
  return data as { id: string; slug: string; name: string; owner_id: string };
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
