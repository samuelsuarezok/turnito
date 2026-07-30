// API DE RESERVA v3: solapamiento por duración + anticipación mínima
// REEMPLAZA TODO: app/api/book/route.ts

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonedTimeToUtc } from "@/lib/slots";

const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { slug, service_id, barber_id, date, time, client_name, client_phone } = body;

  if (
    !slug || !service_id || !date || !time ||
    typeof client_name !== "string" || client_name.trim().length < 3 ||
    typeof client_phone !== "string" || client_phone.trim().length < 7
  ) {
    return NextResponse.json({ error: "Faltan datos o son inválidos" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Barbería activa (traemos también la anticipación mínima)
  const { data: shop } = await supabase
    .from("barbershops")
    .select("id, subscription_status, min_notice_min, timezone")
    .eq("slug", slug)
    .maybeSingle();

  if (!shop || !["trial", "active"].includes(shop.subscription_status)) {
    return NextResponse.json({ error: "Barbería no disponible" }, { status: 404 });
  }

  // 2. El servicio pertenece a esta barbería (traemos la duración)
  const { data: service } = await supabase
    .from("services")
    .select("id, duration_min")
    .eq("id", service_id)
    .eq("barbershop_id", shop.id)
    .eq("active", true)
    .maybeSingle();

  if (!service) {
    return NextResponse.json({ error: "Servicio inválido" }, { status: 400 });
  }

  // 2.2 Barbero: si la barbería cargó barberos, hay que elegir uno de los suyos.
  //     Si no cargó ninguno, es de un solo sillón y barber_id queda NULL.
  const { data: shopBarbers } = await supabase
    .from("barbers")
    .select("id")
    .eq("barbershop_id", shop.id)
    .eq("active", true);

  const hasBarbers = (shopBarbers ?? []).length > 0;
  let barberId: string | null = null;

  if (hasBarbers) {
    if (!barber_id || !(shopBarbers ?? []).some((b) => b.id === barber_id)) {
      return NextResponse.json({ error: "Elegí un barbero disponible" }, { status: 400 });
    }
    barberId = barber_id as string;

    // 2.3 Ese día el barbero no está
    const { data: absent } = await supabase
      .from("barber_absences")
      .select("id")
      .eq("barber_id", barberId)
      .eq("date", date)
      .maybeSingle();

    if (absent) {
      return NextResponse.json({ error: "Ese barbero no atiende ese día. Elegí otro día u otro barbero." }, { status: 400 });
    }
  }

  // 2.5 Día bloqueado por la barbería
  const { data: closedDay } = await supabase
    .from("closed_dates")
    .select("id")
    .eq("barbershop_id", shop.id)
    .eq("date", date)
    .maybeSingle();

  if (closedDay) {
    return NextResponse.json({ error: "La barbería está cerrada ese día" }, { status: 400 });
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
  //     pisar ningún turno existente del día DEL MISMO BARBERO.
  //     Los turnos con barber_id NULL (época de un solo sillón) ocupan a todos.
  const { data: existing } = await supabase
    .from("appointments")
    .select("time, barber_id, services(duration_min)")
    .eq("barbershop_id", shop.id)
    .eq("date", date)
    .in("status", ["confirmed", "done"]);

  const newStart = toMin(String(time));
  const newEnd = newStart + service.duration_min;

  const sameChair = (existing ?? []).filter(
    (a) => !barberId || a.barber_id === null || a.barber_id === barberId
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
      barbershop_id: shop.id,
      service_id,
      // Sólo mandamos barber_id si hay barbero: así la reserva sigue andando
      // aunque todavía no se haya corrido la migración de barberos.
      ...(barberId ? { barber_id: barberId } : {}),
      date,
      time,
      client_name: client_name.trim(),
      client_phone: client_phone.trim(),
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

  // TODO: WhatsApp de confirmación con el link mágico

  return NextResponse.json({ token: appt.token });
}
