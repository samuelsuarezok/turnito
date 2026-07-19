// ============================================
// API DE RESERVA (corre en el servidor)
// Guardar como: app/api/book/route.ts
// ============================================
// Crea el turno usando la service_role key (saltea RLS),
// pero valida todo antes:
//   1. que la barbería exista y esté activa
//   2. que el servicio sea de esa barbería
//   3. que el horario no esté en el pasado
//   4. que el slot siga libre (el índice único es la red final)
//
// TODO (próximo paso): verificación OTP por WhatsApp antes de insertar.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { slug, service_id, date, time, client_name, client_phone } = body;

  // Validaciones básicas
  if (
    !slug ||
    !service_id ||
    !date ||
    !time ||
    typeof client_name !== "string" ||
    client_name.trim().length < 3 ||
    typeof client_phone !== "string" ||
    client_phone.trim().length < 7
  ) {
    return NextResponse.json({ error: "Faltan datos o son inválidos" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Barbería activa
  const { data: shop } = await supabase
    .from("barbershops")
    .select("id, subscription_status")
    .eq("slug", slug)
    .maybeSingle();

  if (!shop || !["trial", "active"].includes(shop.subscription_status)) {
    return NextResponse.json({ error: "Barbería no disponible" }, { status: 404 });
  }

  // 2. El servicio pertenece a esta barbería
  const { data: service } = await supabase
    .from("services")
    .select("id")
    .eq("id", service_id)
    .eq("barbershop_id", shop.id)
    .eq("active", true)
    .maybeSingle();

  if (!service) {
    return NextResponse.json({ error: "Servicio inválido" }, { status: 400 });
  }

  // 3. No reservar en el pasado
  const now = new Date();
  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm] = String(time).split(":").map(Number);
  const slotDate = new Date(y, m - 1, d, hh, mm);
  if (isNaN(slotDate.getTime()) || slotDate < now) {
    return NextResponse.json({ error: "Ese horario ya pasó" }, { status: 400 });
  }

  // 4. Insertar. Si el slot se ocupó en el medio, el índice único
  //    no_double_booking lo rechaza con código 23505.
  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      barbershop_id: shop.id,
      service_id,
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

  // TODO: acá se dispara el WhatsApp de confirmación con el link mágico

  return NextResponse.json({ token: appt.token });
}
