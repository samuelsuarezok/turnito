// ════════════════════════════════════════════════════════════════════════
// RUBROS — Turnito no es sólo para barberías.
//
// Un solo lugar con todo lo que cambia entre un rubro y otro: cómo se
// llama el negocio, qué servicios se le sugieren al arrancar y cuánto
// dura un turno típico. El resto de la app lee de acá en vez de tener
// "barbería" escrito a mano.
//
// Sobre el vocabulario de LAS PERSONAS del equipo: es neutro a propósito
// y no vive acá. Poner "Barbero" como etiqueta de la lista rompe en una
// barbería con barberas, y lo mismo pasa en todos los rubros. El negocio
// y los servicios ya alcanzan para que se sienta propio; el género de la
// persona sólo agrega maneras de escribirlo mal. Ver EQUIPO abajo.
// ════════════════════════════════════════════════════════════════════════

export const RUBRO_IDS = [
  "barberia",
  "unas",
  "pestanas",
  "tatuajes",
  "peluqueria",
  "otro",
] as const;

export type RubroId = (typeof RUBRO_IDS)[number];

export type ServicioSugerido = {
  name: string;
  duration_min: number;
};

export type Rubro = {
  id: RubroId;
  /** Para el selector del onboarding. */
  label: string;
  emoji: string;
  /** Cómo se le dice al local. Va en minúscula: se compone como "tu {negocio}". */
  negocio: string;
  /** Artículo que le corresponde, para armar "la barbería" / "el estudio". */
  articulo: "el" | "la";
  /** Placeholder del nombre en el onboarding. */
  ejemploNombre: string;
  /** Placeholder del slug. */
  ejemploSlug: string;
  /** Se precargan en el paso de servicios. Sin precio: los pone el dueño. */
  servicios: ServicioSugerido[];
  /** Default de slot_minutes: la grilla de horarios de ese rubro. */
  slotMinutes: number;
};

export const RUBROS: Record<RubroId, Rubro> = {
  barberia: {
    id: "barberia",
    label: "Barbería",
    emoji: "💈",
    negocio: "barbería",
    articulo: "la",
    ejemploNombre: "Barbería El Toro",
    ejemploSlug: "el-toro",
    slotMinutes: 30,
    servicios: [
      { name: "Corte", duration_min: 30 },
      { name: "Barba", duration_min: 20 },
      { name: "Corte + barba", duration_min: 45 },
    ],
  },
  unas: {
    id: "unas",
    label: "Uñas",
    emoji: "💅",
    negocio: "estudio",
    articulo: "el",
    ejemploNombre: "Bloom Nails",
    ejemploSlug: "bloom-nails",
    slotMinutes: 60,
    servicios: [
      { name: "Esmaltado semipermanente", duration_min: 60 },
      { name: "Kapping", duration_min: 90 },
      { name: "Soft gel", duration_min: 120 },
      { name: "Retirado", duration_min: 30 },
    ],
  },
  pestanas: {
    id: "pestanas",
    label: "Pestañas y cejas",
    emoji: "👁️",
    negocio: "estudio",
    articulo: "el",
    ejemploNombre: "Estudio Mirada",
    ejemploSlug: "estudio-mirada",
    slotMinutes: 60,
    servicios: [
      { name: "Lifting de pestañas", duration_min: 60 },
      { name: "Extensiones pelo a pelo", duration_min: 120 },
      { name: "Perfilado de cejas", duration_min: 30 },
      { name: "Laminado de cejas", duration_min: 60 },
    ],
  },
  tatuajes: {
    id: "tatuajes",
    label: "Tatuajes",
    emoji: "🖋️",
    negocio: "estudio",
    articulo: "el",
    ejemploNombre: "Tinta Negra Tattoo",
    ejemploSlug: "tinta-negra",
    slotMinutes: 60,
    servicios: [
      // Sesiones largas: por esto la duración llega hasta 8 h y el precio
      // puede quedar "a consultar" (se cotiza por diseño, no por lista).
      { name: "Consulta y diseño", duration_min: 30 },
      { name: "Sesión chica", duration_min: 90 },
      { name: "Sesión media", duration_min: 180 },
      { name: "Día completo", duration_min: 360 },
    ],
  },
  peluqueria: {
    id: "peluqueria",
    label: "Peluquería",
    emoji: "✂️",
    negocio: "salón",
    articulo: "el",
    ejemploNombre: "Salón Nova",
    ejemploSlug: "salon-nova",
    slotMinutes: 30,
    servicios: [
      { name: "Corte", duration_min: 45 },
      { name: "Brushing", duration_min: 45 },
      { name: "Color", duration_min: 120 },
      { name: "Corte + color", duration_min: 180 },
    ],
  },
  otro: {
    id: "otro",
    label: "Otro",
    emoji: "📅",
    negocio: "negocio",
    articulo: "el",
    ejemploNombre: "Mi negocio",
    ejemploSlug: "mi-negocio",
    slotMinutes: 30,
    servicios: [],
  },
};

/** Orden en que se muestran en el selector del onboarding. */
export const RUBROS_LISTA: Rubro[] = RUBRO_IDS.map((id) => RUBROS[id]);

/**
 * Nunca explota: un rubro desconocido (o NULL, en los negocios creados
 * antes de que existiera la columna) cae en "otro", que habla genérico.
 */
export function getRubro(id: string | null | undefined): Rubro {
  return RUBROS[id as RubroId] ?? RUBROS.otro;
}

/** "tu barbería" · "tu estudio" · "tu negocio" */
export function tuNegocio(id: string | null | undefined): string {
  return `tu ${getRubro(id).negocio}`;
}

/** "la barbería" · "el estudio" — para frases como "{X} está cerrada ese día". */
export function elNegocio(id: string | null | undefined): string {
  const r = getRubro(id);
  return `${r.articulo} ${r.negocio}`;
}

// ── Vocabulario del equipo: igual para todos los rubros, y neutro ───────
// Se usa tanto en la página pública como en el panel.
export const EQUIPO = {
  /** Etiqueta del selector en la página de reservas. */
  selector: "Con quién",
  /** Título de la sección en el panel de configuración. */
  seccion: "Equipo",
  /** Placeholder del input de nombre. */
  placeholderNombre: "Nombre",
  agregar: "+ Agregar al equipo",
  /** Cuando el negocio todavía no cargó a nadie. */
  vacio:
    "Si trabajás solo, dejá esto vacío y todo sigue igual. Si son varios, cargá a cada persona: el cliente va a poder elegir con quién.",
  cargado:
    "Cada persona tiene su propia agenda. Marcá los días que alguien no está y esos días no va a recibir turnos.",
} as const;

// ── Precio "a consultar" ───────────────────────────────────────────────
// price = 0 no es "gratis": es que se cotiza aparte. Lo necesitan sobre
// todo los tatuajes, donde el precio sale del diseño y no de una lista.
export const PRECIO_A_CONSULTAR = 0;

export function formatPrecio(price: number): string {
  return price > 0 ? `$${price.toLocaleString("es-AR")}` : "A consultar";
}

// ── Duraciones ─────────────────────────────────────────────────────────
// Antes el tope eran 90 min y no entraba una sesión de tatuaje.
export const DURACION_OPTS = [
  15, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480,
] as const;

export function formatDuracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
