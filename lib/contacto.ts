// Datos de contacto públicos de Turnito.
//
// Vive aparte de lib/email.ts a propósito: esto lo importa el navegador (el
// modal de la landing) y email.ts tiene el cliente de Mailjet, que es server-only.

/** A dónde llegan las consultas del formulario. */
export const CONTACT_TO = "labsbebop@gmail.com";

/**
 * Link para escribirnos por Gmail, ya con asunto y cuerpo cargados.
 *
 * Por qué no un `mailto:`: en Windows el mailto se lo queda la app Correo que
 * viene con el sistema, que casi nadie tiene configurada. El visitante hace
 * click, se le abre un programa que nunca usó pidiéndole que agregue una
 * cuenta, y ahí abandona. Mandándolo a la ventana de redacción de Gmail
 * escribe en la misma sesión que ya tiene abierta.
 *
 * La contra, y conviene tenerla presente: al que usa Outlook o Apple Mail lo
 * mandamos igual a Gmail. Por eso en los dos lugares donde se usa esto la
 * dirección queda además visible en pantalla para copiarla a mano.
 *
 * En el celular, este mismo link lo levanta la app de Gmail si está instalada.
 */
export function gmailLink(asunto: string, cuerpo: string) {
  const q = new URLSearchParams({
    view: "cm",          // ventana de redacción
    fs: "1",             // a pantalla completa, no el popup chico
    to: CONTACT_TO,
    su: asunto,
    body: cuerpo,
  });
  return `https://mail.google.com/mail/?${q}`;
}

/** Lo que ya viene escrito en la consulta que sale de la página de legales. */
export const CONSULTA_LEGALES = {
  asunto: "Consulta sobre términos y privacidad",
  cuerpo: `Hola, les escribo desde la página de Términos y Privacidad de Turnito.

Mi consulta es:
`,
};

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

/**
 * Convierte un teléfono escrito como sea ("351 234-5678", "+54 9 351...") en un
 * link de WhatsApp. Asume Argentina cuando no viene el código de país, que es
 * el caso de todos los números que cargan los negocios.
 *
 * `texto` es el mensaje que aparece ya escrito al abrir el chat.
 */
export function waLink(phone: string, texto?: string) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("54") ? digits : `549${digits}`;
  const base = `https://wa.me/${full}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}
