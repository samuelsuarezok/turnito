// Envío de mails transaccionales. SOLO se usa desde el server (la API key no
// puede salir al navegador nunca).
//
// ⚠️ EL MAIL DE TURNOS ESTÁ APAGADO. Se prende con NEXT_PUBLIC_EMAIL_ENABLED=1,
// y NO alcanza con eso solo. Checklist completo (los 4 pasos, en orden):
//
//   1. Correr supabase/migrations/0002_email_confirmacion.sql en Supabase.
//      Sin esto, cualquier reserva con email escrito FALLA: la columna
//      client_email no existe y el insert revienta.
//   2. Verificar el remitente en Mailjet y cargar las claves (ver "Proveedor").
//   3. En app/legales/page.tsx, nombrar al proveedor en "2.4 Con quién los
//      compartimos", que hoy dice genéricamente "y envío de mensajes". El email
//      del Cliente (2.2) y su finalidad (2.3) ya están declarados. Es
//      obligatorio declararlo ANTES de empezar a guardar direcciones.
//   4. Recién ahí NEXT_PUBLIC_EMAIL_ENABLED=1, que muestra el campo al cliente.
//
// El formulario de contacto (app/api/contact/route.ts) es independiente de ese
// flag: siempre le escribe a CONTACT_TO, que es nuestra casilla.
//
// Proveedor: Mailjet
// ------------------
// Se eligió porque deja verificar UNA dirección suelta (nuestro Gmail) y desde
// ahí escribirle a cualquiera, sin tener dominio propio. Todavía no tenemos
// dominio: la app vive en un .vercel.app.
//
// ⚠️ Mientras el remitente sea un @gmail.com, una parte de los mails va a caer
// en spam. Gmail sabe que ese mensaje no salió de sus servidores, y no hay
// forma de arreglarlo sin dominio. Es una limitación aceptada a propósito, no
// un bug: sirve para arrancar, no es el estado final.
//
// Cuando haya dominio: verificarlo en Mailjet (o pasar a Resend, que es más
// lindo pero EXIGE dominio) y cambiar EMAIL_FROM. El código no se toca.
//
// Para cambiar de proveedor: reescribir SOLO `sendEmail`. El resto del archivo
// (y el resto de la app) no se entera.
//
// Variables de entorno:
//   MAILJET_API_KEY     — API Key de Mailjet (la pública)
//   MAILJET_SECRET_KEY  — Secret Key de Mailjet (la privada; nunca al cliente)
//   EMAIL_FROM          — dirección verificada en Mailjet
//   EMAIL_FROM_NAME     — nombre que ve el destinatario (default: "Turnito")

import { SITE_DOMAIN } from "./site";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());

type SendResult = { ok: true } | { ok: false; error: string };

/** Sólo lo que miramos de la respuesta de Mailjet; el resto no nos interesa. */
type MailjetResponse = {
  Messages?: { Status?: string; Errors?: { ErrorMessage?: string }[] }[];
};

/**
 * Manda un mail. NUNCA lanza: devuelve { ok:false } y el que llama decide.
 * Esto es a propósito — un turno ya guardado no se puede caer porque el
 * proveedor de mail tuvo un mal día.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Para que "Responder" le conteste a quien escribió, no a la casilla del sistema. */
  replyTo?: { email: string; name?: string };
}): Promise<SendResult> {
  const apiKey = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  const from = process.env.EMAIL_FROM;

  // Sin configurar (ej: en local) no es un error: simplemente no se manda.
  if (!apiKey || !secretKey || !from) return { ok: false, error: "EMAIL_NOT_CONFIGURED" };

  // Mailjet autentica con Basic y las DOS claves, no con un bearer.
  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  try {
    const res = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: from, Name: process.env.EMAIL_FROM_NAME || "Turnito" },
            To: [{ Email: opts.to }],
            Subject: opts.subject,
            HTMLPart: opts.html,
            TextPart: opts.text,
            // Mailjet trae el seguimiento ENCENDIDO por defecto: le inyecta al
            // mail un pixel invisible para registrar cuándo lo abrieron, y
            // reescribe los links para contar clics. Esto es transaccional, no
            // una campaña — saber si el cliente abrió su confirmación no nos
            // sirve para nada, y es un dato de comportamiento que después hay
            // que declarar y justificar. Preferimos no recolectarlo.
            TrackOpens: "disabled",
            TrackClicks: "disabled",
            ...(opts.replyTo
              ? { ReplyTo: { Email: opts.replyTo.email, Name: opts.replyTo.name } }
              : {}),
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }

    // OJO: la v3.1 devuelve 200 aunque el mensaje no haya salido — el resultado
    // real viene por mensaje, en Messages[].Status. Sin este chequeo daríamos
    // por enviado algo que Mailjet rechazó (típico: remitente sin verificar).
    const data = (await res.json().catch(() => null)) as MailjetResponse | null;
    const msg = data?.Messages?.[0];
    if (msg?.Status !== "success") {
      const detail = (msg?.Errors ?? [])
        .map((e) => e.ErrorMessage)
        .filter(Boolean)
        .join("; ");
      return { ok: false, error: (detail || `Status ${msg?.Status ?? "desconocido"}`).slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

// Escapa lo que viene del usuario (nombre del cliente, del local, etc.) para
// que no rompa el HTML del mail.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Envoltorio común de los tres mails.
 *
 * Es deliberadamente sobrio: sin barra de color arriba, sin botones anchos y
 * sin etiquetas tipo campaña. Un comprobante tiene que parecer un comprobante.
 * Gmail lee el maquetado colorido como newsletter y lo manda a Promociones, y
 * un aviso de turno tiene que llegar a Principal.
 */
function shell(inner: string, footer: string) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 20px;background:#ffffff;color:#1a1c20;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;">
  <div style="max-width:520px;margin:0 auto;">
    <p style="margin:0 0 20px;font-size:13px;font-weight:700;color:#6b7280;">Turnito</p>
${inner}
    <p style="margin:26px 0 0;padding-top:14px;border-top:1px solid #ececec;font-size:12px;color:#8a8f98;">${footer}</p>
  </div>
</body></html>`;
}

/**
 * Tabla de datos, estilo recibo. Los valores llegan YA escapados: algunos traen
 * un enlace adentro, así que acá no se puede escapar de nuevo.
 */
function rows(pairs: [string, string][]) {
  const tr = ([k, v]: [string, string]) => `      <tr>
        <td style="padding:7px 0;border-bottom:1px solid #f2f2f2;color:#6b7280;font-size:14px;white-space:nowrap;">${esc(k)}</td>
        <td style="padding:7px 0;border-bottom:1px solid #f2f2f2;color:#1a1c20;font-size:14px;font-weight:600;text-align:right;">${v}</td>
      </tr>`;
  return `    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;border-collapse:collapse;">
${pairs.map(tr).join("\n")}
    </table>`;
}

// "2026-07-30" → "jueves 30 de julio"
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function fmtFechaLarga(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  // Mediodía UTC para que el nombre del día no se corra por zona horaria.
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${DIAS[dow]} ${d} de ${MESES[m - 1]}`;
}

/** Arma el mail de confirmación de turno. */
// "351 234-5678" → link de WhatsApp argentino.
function waHref(phone: string) {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("54") ? d : `549${d}`}`;
}

/**
 * Confirmación al cliente.
 *
 * OJO con el canal de respuesta: el dominio NO tiene registros MX, así que si el
 * cliente le da "Responder" a este mail, la respuesta REBOTA. No llega a ningún
 * lado.
 *
 * Se evaluó poner replyTo con el mail del dueño y se descartó: ese mail es su
 * usuario de login, y no corresponde repartirlo a cada cliente que reserva.
 *
 * En vez de eso le damos el canal que un cliente de barbería va a usar igual:
 * el WhatsApp del local. Sale del campo `whatsapp` de businesses.
 */
export function appointmentEmail(a: {
  shopName: string;
  clientName: string;
  serviceName: string;
  staffName: string | null;
  date: string;
  time: string;
  manageUrl: string;
  /** WhatsApp del local. Es el canal de respuesta del cliente — ver abajo. */
  shopWhatsapp?: string | null;
}) {
  const fecha = fmtFechaLarga(a.date);
  const hora = a.time.slice(0, 5);
  const conPersona = a.staffName ? ` con ${a.staffName}` : "";

  const subject = `Turno confirmado — ${a.shopName}, ${fecha} ${hora} hs`;

  const text = [
    `¡Hola ${a.clientName}! Tu turno quedó confirmado.`,
    ``,
    `Negocio: ${a.shopName}`,
    `Servicio: ${a.serviceName}${conPersona}`,
    `Día: ${fecha}`,
    `Hora: ${hora} hs`,
    ``,
    `Para ver o cancelar tu turno, entrá acá:`,
    a.manageUrl,
    ``,
    `Guardá este link: es tu comprobante.`,
    // También en texto plano, no solo en el HTML: hay clientes de correo que
    // bloquean el HTML, y si el canal de respuesta vive solo ahí, esa gente se
    // queda sin forma de contestar (el dominio no tiene MX: responder rebota).
    ...(a.shopWhatsapp
      ? [``, `¿Necesitás cambiar algo? Escribinos por WhatsApp: ${waHref(a.shopWhatsapp)}`]
      : []),
  ].join("\n");

  const html = shell(
    `    <p style="margin:0;">Hola ${esc(a.clientName)}, tu turno en <strong>${esc(a.shopName)}</strong> quedó confirmado.</p>
${rows([
      ["Servicio", esc(a.serviceName + conPersona)],
      ["Día", esc(fecha)],
      ["Hora", `${esc(hora)} hs`],
    ])}
    <p style="margin:16px 0 0;">Podés <a href="${esc(a.manageUrl)}" style="color:#014cff;">ver o cancelar tu turno acá</a>.</p>
    <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Guardá este mail: ese link es tu comprobante.</p>${
      a.shopWhatsapp
        ? `
    <p style="margin:16px 0 0;">¿Necesitás cambiar algo? <a href="${esc(waHref(a.shopWhatsapp))}" style="color:#014cff;">Escribinos por WhatsApp</a>.</p>`
        : ""
    }`,
    `Recibís este mail porque dejaste tu dirección al reservar un turno en ${esc(a.shopName)}.`
  );

  return { subject, html, text };
}

/**
 * Arma el aviso al dueño del local de que le entró un turno.
 *
 * Es otro mail, no el del cliente con el remitente cambiado: acá lo que importa
 * es a quién atiende y cómo ubicarlo, así que el teléfono va arriba de todo y
 * es lo único cliqueable junto con el panel.
 */
export function ownerAppointmentEmail(a: {
  shopName: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  serviceName: string;
  staffName: string | null;
  date: string;
  time: string;
  panelUrl: string;
}) {
  const fecha = fmtFechaLarga(a.date);
  const hora = a.time.slice(0, 5);
  const conPersona = a.staffName ? ` con ${a.staffName}` : "";

  const subject = `Nuevo turno: ${a.clientName} — ${fecha} ${hora} hs`;

  const text = [
    `Te reservaron un turno en ${a.shopName}.`,
    ``,
    `Cliente: ${a.clientName}`,
    `Teléfono: ${a.clientPhone}`,
    ...(a.clientEmail ? [`Email: ${a.clientEmail}`] : []),
    `Servicio: ${a.serviceName}${conPersona}`,
    `Día: ${fecha}`,
    `Hora: ${hora} hs`,
    ``,
    `Verlo en tu panel:`,
    a.panelUrl,
  ].join("\n");

  // El teléfono va como tel: para poder llamarlo de una desde el celular. Es lo
  // primero que necesita el local si tiene que reprogramar o avisar algo.
  const telHref = `tel:${a.clientPhone.replace(/[^\d+]/g, "")}`;

  const html = shell(
    `    <p style="margin:0;"><strong>${esc(a.clientName)}</strong> reservó un turno en ${esc(a.shopName)} para el ${esc(fecha)} a las ${esc(hora)} hs.</p>
${rows([
      ["Teléfono", `<a href="${esc(telHref)}" style="color:#014cff;">${esc(a.clientPhone)}</a>`],
      ...(a.clientEmail ? ([["Email", esc(a.clientEmail)]] as [string, string][]) : []),
      ["Servicio", esc(a.serviceName + conPersona)],
    ])}
    <p style="margin:16px 0 0;">Podés <a href="${esc(a.panelUrl)}" style="color:#014cff;">verlo en tu panel</a>.</p>`,
    `Recibís este aviso porque sos el titular de ${esc(a.shopName)} en Turnito.`
  );

  return { subject, html, text };
}

// La dirección vive en lib/contacto.ts (que también lee el cliente). Se
// re-exporta acá para que la API route la traiga junto con contactEmail.
export { CONTACT_TO } from "./contacto";

/** Arma el mail de una consulta enviada desde el formulario público. */
export function contactEmail(c: {
  name: string;
  email: string;
  rubro: string | null;
  message: string;
}) {
  const subject = `Consulta de ${c.name}${c.rubro ? ` (${c.rubro})` : ""}`;

  const text = [
    `Nueva consulta desde ${SITE_DOMAIN}`,
    ``,
    `Nombre: ${c.name}`,
    `Email: ${c.email}`,
    ...(c.rubro ? [`Rubro: ${c.rubro}`] : []),
    ``,
    c.message,
    ``,
    `— Respondé este mail y le llega directo a ${c.email}.`,
  ].join("\n");

  // El mensaje va escapado y con los saltos de línea convertidos a <br>, para
  // que no rompa el HTML ni se aplaste en un solo párrafo.
  const cuerpo = esc(c.message).replace(/\r?\n/g, "<br>");

  const html = shell(
    `    <p style="margin:0;">Nueva consulta desde ${esc(SITE_DOMAIN)}.</p>
${rows([
      ["Nombre", esc(c.name)],
      ["Email", esc(c.email)],
      ...(c.rubro ? ([["Rubro", esc(c.rubro)]] as [string, string][]) : []),
    ])}
    <p style="margin:16px 0 0;">${cuerpo}</p>`,
    `Respondé este mail y le llega directo a ${esc(c.email)}.`
  );

  return { subject, html, text };
}
