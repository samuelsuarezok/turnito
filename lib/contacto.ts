// Datos de contacto públicos de Turnito.
//
// Vive aparte de lib/email.ts a propósito: esto lo importa el navegador (el
// modal de la landing) y email.ts tiene el cliente de Mailjet, que es server-only.

/** A dónde llegan las consultas del formulario. */
export const CONTACT_TO = "labsbebop@gmail.com";

/** Como se escribe en Argentina. */
export const WHATSAPP_DISPLAY = "351 771-5113";

// wa.me pide el número internacional sin +, sin 0 y sin el 15:
// 54 (país) + 9 (móvil) + 351 (Córdoba) + abonado.
export const WHATSAPP_INTL = "5493517715113";

/** Lo que aparece ya escrito al abrir el chat. */
export const WHATSAPP_MESSAGE =
  "¡Hola! Te escribo desde la web de Turnito. Quería hacerte una consulta:";

export const WHATSAPP_URL =
  `https://wa.me/${WHATSAPP_INTL}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
