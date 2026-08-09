// API DE RESERVA v4: rate limit + honeypot + validación estricta
//   v3: solapamiento por duración + anticipación mínima
//
// OJO con este archivo: usa la service role key, así que SALTEA RLS y todos los
// GRANTs. Es el único endpoint público que escribe en la base. Todo lo que entre
// acá sin validar entra directo.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonedTimeToUtc } from "@/lib/slots";
import { appointmentEmail, isValidEmail, ownerAppointmentEmail, sendEmail } from "@/lib/email";
import { checkIpLimit, clientIp, hashIp, recordAttempt } from "@/lib/rate-limit";
import { isBot, validateBooking } from "@/lib/validate-booking";

const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };

const tooMany = (retryAfterSec: number) =>
  NextResponse.json(
    { error: "Demasiados intentos. Probá de nuevo en un rato.", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const supabase = createAdminClient();
  const ipHash = hashIp(clientIp(req));

  // 0. Rate limit por IP. Va PRIMERO: si esta IP ya está pasada de rosca,
  //    cortamos antes de gastar queries.
  const ipCheck = await checkIpLimit(supabase, ipHash);

  if (!ipCheck.ok) {
    await recordAttempt(supabase, { ipHash, businessId: null, outcome: "rate_limited" });
    return tooMany(ipCheck.retryAfterSec);
  }

  // 0.5 Honeypot: campo oculto que solo completa un bot.
  //     Devolvemos 200 fingiendo éxito, igual que /api/contact: al bot no le
  //     avisamos que lo detectamos, así no adapta el ataque.
  if (isBot(body)) {
    await recordAttempt(supabase, { ipHash, businessId: null, outcome: "honeypot" });
    return NextResponse.json({ token: null, emailSent: false });
  }

  // 0.75 Validación estricta como COMPUERTA. A propósito no usamos los valores
  //      que devuelve: solo cortamos si el payload es basura (teléfono
  //      "1111111", nombre de 1 char, fecha inventada). Los campos los sigue
  //      leyendo el código de abajo desde `body`, tal cual estaba, así
  //      `staff_id` y `client_email` no se caen en el camino.
  const gate = validateBooking(body);
  if (!gate.ok) {
    await recordAttempt(supabase, { ipHash, businessId: null, outcome: "invalid" });
    return NextResponse.json({ error: gate.error }, { status: 400 });
  }

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

  // NOTA: el cupo por negocio NO se chequea acá. Vive en un trigger de Postgres
  // (0006_booking_caps_trigger.sql) y salta en el insert del paso 4. Se hizo así
  // a propósito: en el código tenía una race condition —entre el count y el
  // insert pasaban requests concurrentes— y podía quedar inactivo si la query
  // fallaba. En la base no puede pasar ninguna de las dos.

  // 1. Negocio activo (traemos también la anticipación mínima)
  const { data: shop } = await supabase
    .from("businesses")
    .select("id, name, owner_id, subscription_status, min_notice_min, timezone")
    .eq("slug", slug)
    .maybeSingle();

  if (!shop || !["trial", "active"].includes(shop.subscription_status)) {
    return NextResponse.json({ error: "Este negocio no está disponible" }, { status: 404 });
  }

  // 2. El servicio pertenece a este negocio (traemos la duración)
  const { data: service } = await supabase
    .from("services")
    .select("id, name, duration_min, price")
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

    // 2.25 Esa persona hace ese servicio.
    //
    // La UI ya filtra el selector, pero esto es un endpoint público: cualquiera
    // puede mandar el par que quiera por fuera del navegador. Sin este chequeo
    // se le puede reservar un tatuaje a un barbero.
    //
    // Regla de 0009: si el servicio no tiene NINGUNA fila en service_staff, lo
    // hace todo el equipo. Por eso preguntamos primero si hay asignación.
    const { data: asignados } = await supabase
      .from("service_staff")
      .select("staff_id")
      .eq("service_id", service_id);

    const restringido = (asignados ?? []).length > 0;
    if (restringido && !(asignados ?? []).some((a) => a.staff_id === staffId)) {
      return NextResponse.json(
        { error: "Esa persona no hace ese servicio. Elegí otra." },
        { status: 400 }
      );
    }

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
  const fila = {
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
  };

  // Precio y nombre CONGELADOS al momento de reservar. La facturación se
  // calcula con esto y nunca con services.price, que cambia cuando el negocio
  // actualiza la lista. Ver 0008_precio_en_turno.sql.
  const congelado = { price: service.price, service_name: service.name };

  let { data: appt, error } = await supabase
    .from("appointments")
    .insert({ ...fila, ...congelado })
    .select("token")
    .single();

  // Red de seguridad para la ventana entre "se deployó el código" y "se corrió
  // la 0008": si las columnas todavía no existen, guardamos el turno sin ellas
  // antes que romper todas las reservas. PGRST204 es el "no encuentro esa
  // columna" de PostgREST. Se puede borrar cuando la migración esté corrida en
  // todos los entornos.
  if (error?.code === "PGRST204") {
    console.warn("Falta correr 0008_precio_en_turno.sql: el turno se guarda sin precio.");
    ({ data: appt, error } = await supabase
      .from("appointments")
      .insert(fila)
      .select("token")
      .single());
  }

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ese horario se acaba de ocupar. Elegí otro.", code: "SLOT_TAKEN" },
        { status: 409 }
      );
    }
    // El cupo lo levanta el trigger enforce_booking_caps(). Llega como
    // excepción de plpgsql, así que hay que traducirla a algo que el cliente
    // entienda en vez de un 500 genérico.
    if (error.message.includes("BOOKING_CAP_DAY")) {
      await recordAttempt(supabase, { ipHash, businessId: shop.id, outcome: "rate_limited" });
      return tooMany(6 * 3600);
    }
    if (error.message.includes("BOOKING_CAP_HOUR")) {
      await recordAttempt(supabase, { ipHash, businessId: shop.id, outcome: "rate_limited" });
      return tooMany(3600);
    }
    console.error("Error al reservar:", error.message);
    return NextResponse.json({ error: "Error al reservar" }, { status: 500 });
  }

  // Sin error y sin fila no debería pasar nunca, pero como el insert ahora puede
  // ejecutarse dos veces (ver el fallback de PGRST204), TypeScript ya no puede
  // deducir que `appt` está: se lo confirmamos acá en vez de con un `!`.
  if (!appt) {
    console.error("Error al reservar: el insert no devolvió el turno");
    return NextResponse.json({ error: "Error al reservar" }, { status: 500 });
  }

  // 5. Avisos por mail: confirmación al cliente y aviso al dueño.
  // OJO: el turno YA está guardado. Si algo de esto falla, se loguea y seguimos
  // — sería absurdo perder una reserva porque el proveedor de mail se cayó.
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const datos = {
    shopName: shop.name,
    clientName: client_name.trim(),
    serviceName: service.name,
    staffName: staffId ? (shopStaff ?? []).find((b) => b.id === staffId)?.name ?? null : null,
    date: String(date),
    time: String(time),
  };

  // El mail del dueño no está en `businesses`: vive en auth.users, atado por
  // owner_id. Lo leemos con la service role key, que es la única que puede.
  const { data: ownerData } = await supabase.auth.admin.getUserById(shop.owner_id);
  const ownerEmail = ownerData?.user?.email ?? null;

  // Al cliente sólo si dejó su mail; al dueño siempre, que para eso es su
  // negocio. Los dos en paralelo: son llamadas de red y no tiene sentido que el
  // cliente espere una atrás de la otra para ver su comprobante.
  const [clientSent, ownerSent] = await Promise.all([
    email
      ? sendEmail({
          to: email,
          ...appointmentEmail({ ...datos, manageUrl: `${origin}/t/${appt.token}` }),
        })
      : Promise.resolve(null),
    ownerEmail
      ? sendEmail({
          to: ownerEmail,
          ...ownerAppointmentEmail({
            ...datos,
            clientPhone: client_phone.trim(),
            clientEmail: email,
            panelUrl: `${origin}/panel`,
          }),
          // Si el cliente dejó mail, "Responder" le escribe directo a él.
          ...(email ? { replyTo: { email, name: client_name.trim() } } : {}),
        })
      : Promise.resolve(null),
  ]);

  if (clientSent && !clientSent.ok) {
    console.error("No se pudo enviar el mail de confirmación:", clientSent.error);
  }
  if (ownerSent && !ownerSent.ok) {
    console.error("No se pudo avisar al dueño del turno nuevo:", ownerSent.error);
  }

  const emailSent = clientSent?.ok ?? false;

  // TODO: WhatsApp de confirmación con el link mágico

  // Reserva exitosa: cuenta para el cupo de la IP.
  await recordAttempt(supabase, { ipHash, businessId: shop.id, outcome: "booked" });

  return NextResponse.json({ token: appt.token, emailSent });
}
