// Datos mínimos del negocio para la vista previa del link, leídos DESDE EL
// SERVIDOR.
//
// Va aparte del page y del opengraph-image porque los dos necesitan lo mismo:
// el nombre del local y su rubro. Sin esto, cada uno haría su propia consulta y
// se irían despegando.
//
// Usa la anon key, no la service role: `public_shop_info` es la misma RPC que
// llama el navegador y ya filtra por suscripción activa. Meter la service role
// en un archivo que se ejecuta por cada visita pública sería regalar permisos
// para leer un nombre.

import { createClient } from "@supabase/supabase-js";
import { getRubro } from "@/lib/rubros";

export type ShopMeta = { name: string; rubro: string } | null;

export async function getShopMeta(slug: string): Promise<ShopMeta> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase.rpc("public_shop_info", { shop_slug: slug });
    if (!data?.name) return null;
    return { name: data.name as string, rubro: getRubro(data.business_type).label };
  } catch {
    // Si la base no responde, la página igual se renderiza y el cliente
    // reintenta. Una vista previa fea es mejor que un 500.
    return null;
  }
}
