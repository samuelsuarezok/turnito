// El dominio público, en un solo lugar.
//
// Es sólo para MOSTRAR: aparece en la landing, el onboarding, el panel y la
// página de cada negocio. Los links de verdad no salen de acá — se arman con el
// origin del browser o del request, así que en local y en los previews de
// Vercel siguen apuntando a donde corresponde sin tocar nada.
export const SITE_DOMAIN = "turnito.site";

/**
 * Nombre del local → slug de la URL.
 *
 * Vive acá y no en el onboarding porque hay dos lugares que necesitan el MISMO
 * criterio: el onboarding, que genera el slug, y el panel, que compara el slug
 * guardado contra el nombre actual para saber si se despegaron.
 *
 * La base valida el slug con  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')  —
 * sin guiones dobles, sin guión al principio ni al final. Colapsar y recortar
 * los guiones DESPUÉS del slice() es lo que evita que truncar a 30 caracteres
 * justo sobre un guión genere un slug inválido y el insert reviente con un
 * 23514 crudo en la cara del usuario.
 */
export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 30)
    .replace(/^-+|-+$/g, "");
