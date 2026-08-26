// La forma exacta de lo que devuelven admin_resumen() y admin_negocios().
// Si tocás la migración 0013, esto se toca también.

export type Resumen = {
  cuentas: {
    /** Registrados en Turnito, hayan publicado un local o no. */
    total: number;
    ultimos_7: number;
    ultimos_30: number;
    /** Se registraron y abandonaron el onboarding. */
    sin_negocio: number;
  };
  negocios: {
    total: number;
    ultimos_7: number;
    ultimos_30: number;
    en_prueba: number;
    /** Vencidos y operando igual: nada corta el acceso solo. */
    prueba_vencida: number;
    pagando: number;
    cortados: number;
    vencen_en_7: number;
  };
  uso: {
    turnos: number;
    turnos_7: number;
    turnos_30: number;
    /** Locales que recibieron al menos un turno en el mes. */
    locales_vivos_30: number;
    /** Clientes finales distintos (por teléfono). */
    personas: number;
    personas_30: number;
  };
  sin_negocio: { email: string | null; creada: string }[];
};

export type Negocio = {
  id: string;
  nombre: string;
  slug: string;
  rubro: string | null;
  whatsapp: string;
  estado: string;
  /** ISO. Alta del local, no de la cuenta. */
  creado: string;
  /** ISO. Hasta cuándo tiene acceso (prueba o mes pagado). */
  vence: string;
  /** Días enteros que le quedan. Negativo = venció hace tantos. */
  dias: number;
  antiguedad: number;
  email: string | null;
  ultimo_ingreso: string | null;
  equipo: number;
  turnos: number;
  turnos_30: number;
  ultimo_turno: string | null;
};
