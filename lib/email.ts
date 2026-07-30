// Envío de mails transaccionales. SOLO se usa desde el server (la API key no
// puede salir al navegador nunca).
//
// Proveedor: Brevo. Se eligió porque permite verificar UNA dirección suelta
// (ej: tu Gmail) sin tener dominio propio, y desde ahí mandarle a cualquiera.
// Resend, que es más lindo de usar, sin dominio sólo deja mandarte mails a vos
// mismo — no sirve para avisarle al cliente.
//
// Para cambiar de proveedor: reescribir SOLO `sendEmail`. El resto del archivo
// (y el resto de la app) no se entera.
//
// Variables de entorno:
//   BREVO_API_KEY    — la key de Brevo (obligatoria; sin ella no se manda nada)
//   EMAIL_FROM       — dirección verificada en Brevo
//   EMAIL_FROM_NAME  — nombre que ve el destinatario (default: "Turnito")

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());

type SendResult = { ok: true } | { ok: false; error: string };

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
}): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;

  // Sin configurar (ej: en local) no es un error: simplemente no se manda.
  if (!apiKey || !from) return { ok: false, error: "EMAIL_NOT_CONFIGURED" };

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: from, name: process.env.EMAIL_FROM_NAME || "Turnito" },
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.html,
        textContent: opts.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
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
export function appointmentEmail(a: {
  shopName: string;
  clientName: string;
  serviceName: string;
  barberName: string | null;
  date: string;
  time: string;
  manageUrl: string;
}) {
  const fecha = fmtFechaLarga(a.date);
  const hora = a.time.slice(0, 5);
  const conBarbero = a.barberName ? ` con ${a.barberName}` : "";

  const subject = `Turno confirmado — ${a.shopName}, ${fecha} ${hora} hs`;

  const text = [
    `¡Hola ${a.clientName}! Tu turno quedó confirmado.`,
    ``,
    `Barbería: ${a.shopName}`,
    `Servicio: ${a.serviceName}${conBarbero}`,
    `Día: ${fecha}`,
    `Hora: ${hora} hs`,
    ``,
    `Para ver o cancelar tu turno, entrá acá:`,
    a.manageUrl,
    ``,
    `Guardá este link: es tu comprobante.`,
  ].join("\n");

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #ECECE8;color:#6E6E68;font-size:14px;">${esc(k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #ECECE8;color:#101010;font-size:14px;font-weight:600;text-align:right;">${esc(v)}</td>
    </tr>`;

  // Estilos inline y layout con tablas: es lo único que renderiza parejo en
  // Gmail, Outlook y demás.
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#F5F5F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E4E4DE;">
    <tr><td style="background:#101010;padding:20px 24px;">
      <span style="color:#D8F34E;font-size:18px;font-weight:700;letter-spacing:-0.02em;">Turnito</span>
    </td></tr>
    <tr><td style="padding:28px 24px 8px;">
      <div style="display:inline-block;background:#D8F34E;color:#101010;font-size:11px;font-weight:700;letter-spacing:0.08em;padding:6px 12px;border-radius:999px;">TURNO CONFIRMADO</div>
      <h1 style="margin:16px 0 4px;font-size:22px;color:#101010;font-weight:700;">¡Hola ${esc(a.clientName)}!</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6E6E68;line-height:1.5;">Tu turno en <strong style="color:#101010;">${esc(a.shopName)}</strong> quedó reservado. Te esperamos.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${row("Servicio", a.serviceName + conBarbero)}
        ${row("Día", fecha)}
        ${row("Hora", `${hora} hs`)}
      </table>
    </td></tr>
    <tr><td style="padding:8px 24px 28px;">
      <a href="${esc(a.manageUrl)}" style="display:block;background:#D8F34E;color:#101010;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:999px;">Ver o cancelar mi turno</a>
      <p style="margin:14px 0 0;font-size:12px;color:#8A8A82;line-height:1.5;text-align:center;">Guardá este mail: el link de arriba es tu comprobante.</p>
    </td></tr>
  </table>
  <p style="max-width:480px;margin:14px auto 0;font-size:11px;color:#9A9A92;text-align:center;line-height:1.5;">
    Recibís este mail porque dejaste tu dirección al reservar un turno en ${esc(a.shopName)}.
  </p>
</body></html>`;

  return { subject, html, text };
}
