import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Rutas privadas o con credenciales en la URL (/t/<token>).
      disallow: ["/panel", "/admin", "/api/", "/t/", "/onboarding", "/recuperar", "/login"],
    },
    sitemap: "https://turnito.site/sitemap.xml",
  };
}
