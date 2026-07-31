// API DE RESERVA v3: solapamiento por duración + anticipación mínima
// REEMPLAZA TODO: app/api/book/route.ts

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonedTimeToUtc } from "@/lib/slots";
import { appointmentEmail, isValidEmail, sendEmail } from "@/lib/email";

const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { slug, service_id, staff_id, date, time, client_name, client_phone, client_email } = body;

  if (
    !slug || !service_id || !date || !time ||
    typeof client_name !== "string" || client_name.trim().length < 3 ||
    typeof client_phone !== "string" || client_phone.trim().length < 7
  ) {
    return NextResponse.json({ error: "Faltan datos o son inválidos" }, { status: 400 });
  }

  // El email es OPCIONAL. Si lo dejan vacío se reserva igual; si lo escriben
  // mal avisamos, porque si no el cliente se queda esperando un mail que no va
  // a llegar nunca.
  //
  // Con la feature apagada ignoramos `client_email` aunque lo manden: la
  // columna todavía no existe en la base y el insert reventaría la reserva.
  const emailEnabled = process.env.NEXT_PUBLIC_EMAIL_ENABLED === "1";
  const rawEmail = emailEnabled && typeof client_email === "string" ? client_email.trim() : "";
  if (rawEmail && !isValidEmail(rawEmail)) {
    return NextResponse.json({ error: "Ese email no parece válido. Revisalo o dejalo vacío." }, { status: 400 });
  }
  const email = rawEmail ? rawEmail.toLowerCase() : null;

  const supabase = createAdminClient();

  // 1. Negocio activo (traemos también la anticipación mínima)
  const { data: shop } = await supabase
    .from("businesses")
    .select("id, name, subscription_status, min_notice_min, timezone")
    .eq("slug", slug)
    .maybeSingle();

  if (!shop || !["trial", "active"].includes(shop.subscription_status)) {
    return NextResponse.json({ error: "Este negocio no está disponible" }, { status: 404 });
  }

  // 2. El servicio pertenece a este negocio (traemos la duración)
  const { data: service } = await supabase
    .from("services")
    .select("id, name, duration_min")
    .eq("id", service_id)
    .eq("business_id", shop.id)
    .eq("active", true)
    .maybeSingle();

  if (!service) {
    return NextResponse.json({ error: "Servicio inválido" }, { status: 400 });
  }

  // 2.2 Equipo: si el negocio cargó gente, hay que elegir a alguien de los suyos.
  //     Si no cargó a nadie, es de una sola agenda y staff_id queda NULL.
  const { data: shopStaff } = await supabase
    .from("staff")
    .select("id, name")
    .eq("business_id", shop.id)
    .eq("active", true);

  const hasStaff = (shopStaff ?? []).length > 0;
  let staffId: string | null = null;

  if (hasStaff) {
    if (!staff_id || !(shopStaff ?? []).some((b) => b.id === staff_id)) {
      return NextResponse.json({ error: "Elegí con quién querés reservar" }, { status: 400 });
    }
    staffId = staff_id as string;

    // 2.3 Esa persona no está ese día
    const { data: absent } = await supabase
      .from("staff_absences")
      .select("id")
      .eq("staff_id", staffId)
      .eq("date", date)
      .maybeSingle();

    if (absent) {
      return NextResponse.json({ error: "No atiende ese día. Elegí otro día u otra persona." }, { status: 400 });
    }
  }

  // 2.5 Día bloqueado por el negocio
  const { data: closedDay } = await supabase
    .from("closed_dates")
    .select("id")
    .eq("business_id", shop.id)
    .eq("date", date)
    .maybeSingle();

  if (closedDay) {
    return NextResponse.json({ error: "El local está cerrado ese día" }, { status: 400 });
  }

  // 3. Anticipación mínima (tampoco en el pasado)
  // El horario elegido se interpreta en la zona del LOCAL, no en la del server
  // (que en Vercel es UTC): si no, un turno válido a las 16:45 de Córdoba se
  // leía como 13:45 y se rechazaba por falta de anticipación.
  const now = new Date();
  const slotDate = zonedTimeToUtc(String(date), String(time), shop.timezone || "America/Argentina/Buenos_Aires");
  if (isNaN(slotDate.getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }
  const minStart = new Date(now.getTime() + (shop.min_notice_min ?? 0) * 60000);
  if (slotDate < minStart) {
    return NextResponse.json(
      { error: `Las reservas requieren al menos ${shop.min_notice_min} min de anticipación` },
      { status: 400 }
    );
  }

  // 3.5 Solapamiento por duración: el nuevo turno [inicio, fin) no puede
  //     pisar ningún turno existente del día DE LA MISMA PERSONA.
  //     Los turnos con staff_id NULL (época de un solo sillón) ocupan a todos.
  const { data: existing } = await supabase
    .from("appointments")
    .select("time, staff_id, services(duration_min)")
    .eq("business_id", shop.id)
    .eq("date", date)
    .in("status", ["confirmed", "done"]);

  const newStart = toMin(String(time));
  const newEnd = newStart + service.duration_min;

  const sameChair = (existing ?? []).filter(
    (a) => !staffId || a.staff_id === null || a.staff_id === staffId
  );

  const overlaps = sameChair.some((a) => {
    const s = toMin(a.time as string);
    const dur = (a.services as unknown as { duration_min: number } | null)?.duration_min ?? 30;
    return newStart < s + dur && newEnd > s;
  });

  if (overlaps) {
    return NextResponse.json(
      { error: "Ese horario se superpone con otro turno. Elegí otro.", code: "SLOT_TAKEN" },
      { status: 409 }
    );
  }

  // 4. Insertar (el índice único sigue siendo la red final para inicios exactos)
  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      business_id: shop.id,
      service_id,
      // Sólo mandamos staff_id si hay equipo cargado: así la reserva sigue
      // andando aunque todavía no se haya corrido la migración del equipo.
      ...(staffId ? { staff_id: staffId } : {}),
      date,
      time,
      client_name: client_name.trim(),
      client_phone: client_phone.trim(),
      // Igual que staff_id: si no dejó email, ni mandamos la columna. Así la
      // reserva sigue andando aunque falte correr la migración 0002.
      ...(email ? { client_email: email } : {}),
    })
    .select("token")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ese horario se acaba de ocupar. Elegí otro.", code: "SLOT_TAKEN" },
        { status: 409 }
      );
    }
    console.error("Error al reservar:", error.message);
    return NextResponse.json({ error: "Error al reservar" }, { status: 500 });
  }

  // 5. Mail de confirmación (opcional).
  // OJO: el turno YA está guardado. Si el mail falla, se loguea y seguimos —
  // sería absurdo perder una reserva porque el proveedor de mail se cayó.
  let emailSent = false;
  if (email) {
    const origin = req.headers.get("origin") || new URL(req.url).origin;
    const { subject, html, text } = appointmentEmail({
      shopName: shop.name,
      clientName: client_name.trim(),
      serviceName: service.name,
      staffName: staffId ? (shopStaff ?? []).find((b) => b.id === staffId)?.name ?? null : null,
      date: String(date),
      time: String(time),
      manageUrl: `${origin}/t/${appt.token}`,
    });
    const sent = await sendEmail({ to: email, subject, html, text });
    emailSent = sent.ok;
    if (!sent.ok) console.error("No se pudo enviar el mail de confirmación:", sent.error);
  }

  // TODO: WhatsApp de confirmación con el link mágico

  return NextResponse.json({ token: appt.token, emailSent });
}
