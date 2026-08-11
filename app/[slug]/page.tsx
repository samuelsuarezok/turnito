// Página pública de reserva.
//
// Es un componente de SERVIDOR y no hace casi nada: resuelve el slug y monta el
// cliente. Existe por una sola razón, y es `generateMetadata`.
//
// Antes todo el archivo era "use client", así que Next no podía generar
// metadata por negocio y cada link compartido —turnito.site/bloom-nails,
// turnito.site/el-toro— mostraba la vista previa de Turnito. El local repartía
// SU link y la preview hablaba de otra marca.

import type { Metadata } from "next";
import BookingClient from "./booking-client";
import { getShopMeta } from "./shop-meta";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getShopMeta(slug);

  // Slug inexistente o negocio dado de baja: sin datos no inventamos un nombre.
  if (!shop) {
    return {
      title: "Reservá tu turno — Turnito",
      robots: { index: false },
    };
  }

  const title = `${shop.name} — Reservá tu turno`;
  const description = `Elegí el día y la hora que te queden bien y reservá en menos de un minuto. Sin apps ni cuentas.`;

  return {
    title,
    description,
    // La imagen la genera opengraph-image.tsx, que Next engancha solo. No hace
    // falta declararla acá; si la declaráramos, pisaríamos la generada.
    openGraph: {
      title,
      description,
      url: `/${slug}`,
      siteName: shop.name,
      locale: "es_AR",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookingClient slug={slug} />;
}
