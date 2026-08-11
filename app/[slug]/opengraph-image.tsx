// Vista previa del link de CADA negocio.
//
// Cuando la manicurista comparte turnito.site/bloom-nails, en WhatsApp tiene
// que aparecer "Bloom Nails", no Turnito. El local reparte su link; la preview
// es parte de su marca, no de la nuestra.
//
// Se dibuja con ImageResponse (next/og), así que es HTML+CSS en el servidor: no
// hace falta ni un diseñador ni un archivo por negocio.

import { ImageResponse } from "next/og";
import { getShopMeta } from "./shop-meta";
import { SITE_DOMAIN } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Reservá tu turno";

const BLUE = "#014CFF";
const LIME = "#B4EC5C";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShopMeta(slug);
  const nombre = shop?.name ?? "Reservá tu turno";

  // El nombre del local manda, así que su tamaño se adapta al largo: "El Toro"
  // y "Estudio de Uñas y Pestañas del Centro" no pueden ir al mismo cuerpo.
  const tam = nombre.length > 28 ? 76 : nombre.length > 18 ? 96 : 118;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "center", background: BLUE, padding: "0 88px",
          fontFamily: "sans-serif",
        }}
      >
        {shop?.rubro && (
          <div
            style={{
              display: "flex", alignSelf: "flex-start", background: LIME,
              color: "#0A0A0A", fontSize: 30, fontWeight: 700,
              padding: "12px 30px", borderRadius: 999, marginBottom: 34,
            }}
          >
            {shop.rubro}
          </div>
        )}

        <div style={{ display: "flex", fontSize: tam, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.05 }}>
          {nombre}
        </div>

        <div style={{ display: "flex", fontSize: 40, color: "rgba(255,255,255,.82)", marginTop: 26 }}>
          Reservá tu turno online
        </div>

        <div
          style={{
            display: "flex", alignItems: "center", gap: 16,
            marginTop: 56, fontSize: 30, color: "rgba(255,255,255,.6)",
          }}
        >
          <div style={{ display: "flex", width: 34, height: 34, borderRadius: 10, background: "#FFFFFF" }} />
          {SITE_DOMAIN}/{slug}
        </div>
      </div>
    ),
    { ...size }
  );
}
