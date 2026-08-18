// Le avisa por mail al cliente que le movieron el turno.
//
// POR QUÉ ES UNA RUTA Y NO PARTE DEL MOVIMIENTO:
//
// El turno se mueve desde el panel con la sesión del dueño y RLS de por medio
// (app/panel/page.tsx → confirmMove). Eso está bien y no se toca. Pero la clave
// de Mailjet es server-only, así que el mail no puede salir del navegador: hace
// falta un endpoint. Queda entonces: primero se mueve el turno, después se
// avisa. Si el aviso falla, el turno YA está movido — es lo correcto, perder el
// cambio porque el proveedor de mail tuvo un mal día sería peor.
//
// SEGURIDAD: esta ruta manda mails, así que no puede quedar abierta. Sólo la
// puede usar el dueño del negocio al que pertenece el turno, y el destinatario
// NO viaja en el request: sale de la base. Aunque alguien adivine un id ajeno,
// no puede elegir a quién escribirle.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import { appointmentMovedEmail, isValidEmail, sendEmail } from "@/lib/email";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ES_HORA = /^\d{2}:\d{2}(:\d{2})?$/;

/** Sin mail no hay nada que mandar, y no es un error: el cliente no lo dejó. */
const sinMail = () => NextResponse.json({ sent: false, reason: "sin-email" });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { appointmentId, oldDate, oldTime } = body;
  if (
    typeof appointmentId !== "string" ||
    typeof oldDate !== "string" || !ES_FECHA.test(oldDate) ||
    typeof oldTime !== "string" || !ES_HORA.test(oldTime)
  ) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Con la feature de mail apagada la columna client_email puede no existir
  // todavía (ver el checklist en lib/email.ts). Cortamos antes de tocarla.
  if (process.env.NEXT_PUBLIC_EMAIL_ENABLED !== "1") return sinMail();

  // 1. Quién está pidiendo esto.
  const sesion = await createSessionClient();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // 2. El turno, con el negocio colgado. Va con la service role porque necesita
  //    leer el mail del cliente y el owner_id para el chequeo de abajo.
  const admin = createAdminClient();
  const { data: appt } = await admin
    .from("appointments")
    .select("id, client_name, client_email, date, time, token, staff_id, service_name, business_id, services(name), businesses(name, owner_id, whatsapp)")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appt) return NextResponse.json({ error: "Turno inexistente" }, { status: 404 });

  const shop = appt.businesses as unknown as { name: string; owner_id: string; whatsapp: string | null } | null;

  // 3. Es SU turno. Sin esto, cualquier dueño logueado podría disparar mails de
  //    los turnos de otro negocio con sólo tener el id.
  if (!shop || shop.owner_id !== user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const email = appt.client_email;
  if (!isValidEmail(email)) return sinMail();

  // 4. Con quién es el turno (si el negocio tiene equipo cargado).
  let staffName: string | null = null;
  if (appt.staff_id) {
    const { data: persona } = await admin
      .from("staff").select("name").eq("id", appt.staff_id).maybeSingle();
    staffName = persona?.name ?? null;
  }

  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const servicio =
    appt.service_name ??
    (appt.services as unknown as { name: string } | null)?.name ??
    "tu turno";

  const enviado = await sendEmail({
    to: email,
    ...appointmentMovedEmail({
      shopName: shop.name,
      clientName: appt.client_name,
      serviceName: servicio,
      staffName,
      oldDate,
      oldTime,
      // El horario nuevo sale de la BASE, no del request: es el que quedó
      // guardado de verdad. Si el update no llegó a impactar, el mail no puede
      // andar prometiendo un horario que no existe.
      date: String(appt.date),
      time: String(appt.time),
      manageUrl: `${origin}/t/${appt.token}`,
      shopWhatsapp: shop.whatsapp,
    }),
  });

  if (!enviado.ok) {
    console.error("No se pudo avisar del turno movido:", enviado.error);
    return NextResponse.json({ sent: false, reason: "fallo" }, { status: 502 });
  }

  return NextResponse.json({ sent: true, to: email });
}
