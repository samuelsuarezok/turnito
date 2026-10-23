import type { MetadataRoute } from "next";

// Solo las páginas públicas del sitio. Las de reserva de cada negocio
// (/<slug>) no van: son de cada cliente, no de Turnito.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://turnito.site",
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://turnito.site/legales",
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
