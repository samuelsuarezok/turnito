// Validación del payload de reserva.
//
// Honestidad sobre el alcance: esto frena basura EVIDENTE (teléfonos como
// "1111111", nombres de un carácter, payloads mal formados). NO detecta un
// nombre falso plausible tipo "dsdasda" — eso es indetectable por regex sin
// rechazar apellidos reales. Contra eso trabajan el honeypot y el rate limit.

export type BookingInput = {
  slug: string;
  service_id: string;
  date: string;
  time: string;
  client_name: string;
  client_phone: string;
};

export type ValidationResult =
  | { ok: true; value: BookingInput }
  | { ok: false; error: string };

const NAME_MIN = 3;
const NAME_MAX = 60;

// Solo dígitos, espacios, guiones, paréntesis y un + inicial.
const PHONE_SHAPE = /^\+?[\d\s()-]{7,25}$/;
const PHONE_DIGITS_MIN = 8; // fijo corto del interior
const PHONE_DIGITS_MAX = 15; // tope E.164

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SHAPE = /^\d{2}:\d{2}(:\d{2})?$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateBooking(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Datos inválidos" };
  }

  const b = body as Record<string, unknown>;

  if (
    !isNonEmptyString(b.slug) ||
    !isNonEmptyString(b.service_id) ||
    !isNonEmptyString(b.date) ||
    !isNonEmptyString(b.time)
  ) {
    return { ok: false, error: "Faltan datos de la reserva" };
  }

  if (!DATE_SHAPE.test(b.date)) return { ok: false, error: "Fecha inválida" };
  if (!TIME_SHAPE.test(b.time)) return { ok: false, error: "Horario inválido" };

  // ── Nombre ──────────────────────────────────────────────────────────────
  if (typeof b.client_name !== "string") {
    return { ok: false, error: "Falta tu nombre" };
  }
  const name = b.client_name.trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN) {
    return { ok: false, error: "Tu nombre es muy corto" };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, error: "Tu nombre es demasiado largo" };
  }
  // Al menos una letra (unicode: acentos y ñ cuentan).
  if (!/\p{L}/u.test(name)) {
    return { ok: false, error: "Poné tu nombre real, por favor" };
  }

  // ── Teléfono ────────────────────────────────────────────────────────────
  if (typeof b.client_phone !== "string") {
    return { ok: false, error: "Falta tu WhatsApp" };
  }
  const phoneRaw = b.client_phone.trim();
  if (!PHONE_SHAPE.test(phoneRaw)) {
    return { ok: false, error: "Ese WhatsApp no parece válido" };
  }

  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length < PHONE_DIGITS_MIN || digits.length > PHONE_DIGITS_MAX) {
    return { ok: false, error: "Ese WhatsApp no parece válido" };
  }
  // "1111111", "0000000000": un número real no tiene menos de 3 dígitos
  // distintos. Bajo riesgo de falso positivo, corta la basura obvia.
  if (new Set(digits).size < 3) {
    return { ok: false, error: "Ese WhatsApp no parece válido" };
  }

  return {
    ok: true,
    value: {
      slug: b.slug.trim(),
      service_id: b.service_id.trim(),
      date: b.date,
      time: b.time,
      client_name: name,
      client_phone: phoneRaw,
    },
  };
}

/**
 * Honeypot: campo oculto que un humano nunca ve ni completa. Si viene con
 * contenido, es un bot rellenando todos los inputs del form.
 */
export function isBot(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const trap = (body as Record<string, unknown>).website;
  return typeof trap === "string" && trap.trim().length > 0;
}
