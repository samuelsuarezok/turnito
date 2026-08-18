"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { SITE_DOMAIN, slugify } from "@/lib/site";
import { waLink } from "@/lib/contacto";
import { turnosACsv, descargarCsv, type FilaTurno } from "@/lib/csv";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import { computeSlots, normalizeClosed, fullDayClosedSet, toMin, type ClosedEntry, type OpeningRange } from "@/lib/slots";
import { formatDuracion } from "@/lib/rubros";

type Shop = { id: string; name: string; slug: string };
type StaffMember = { id: string; name: string };
// Para cargar turnos a mano desde el panel. staff_ids vacío = lo hace todo el
// equipo (0009). El booking_mode NO filtra acá: cargar a mano un tatuaje que se
// coordinó por WhatsApp es justamente para lo que existe esta pantalla.
type Svc = {
  id: string; name: string; duration_min: number; price: number;
  staff_ids: string[];
};
type Appt = {
  id: string; client_name: string; client_phone: string;
  date: string; time: string; status: string; token: string;
  staff_id: string | null;
  // Congelados al reservar: la plata se cuenta con ESTO y no con services.price,
  // que cambia cuando el negocio actualiza la lista. Ver 0008_precio_en_turno.
  price: number | null;
  service_name: string | null;
  services: { name: string; duration_min: number } | null;
};
// Datos de agenda para reprogramar (mismos que usa la reserva pública).
type SchedInfo = { slot_minutes: number; hours: OpeningRange[]; closed: ClosedEntry[] };
type MoveBusy = { id: string; time: string; staff_id: string | null; services: { duration_min: number } | null };

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const EASE = [0.22, 1, 0.36, 1] as const;

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getNext7Days() {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
}

// "2026-08-12" → "el martes 12". Para hoy y mañana usa la palabra, que se lee
// mejor y no obliga al cliente a mirar el calendario.
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function cuando(ds: string) {
  const hoy = fmtDate(new Date());
  const manana = fmtDate(new Date(Date.now() + 86400000));
  if (ds === hoy) return "hoy";
  if (ds === manana) return "mañana";
  const [y, m, d] = ds.split("-").map(Number);
  return `el ${DIAS_LARGOS[new Date(y, m - 1, d).getDay()]} ${d}`;
}

// Igual que cuando(), pero con la preposición contraída: "de hoy" pero "DEL
// martes 11". Sin esto salía "de el martes 11".
function deCuando(ds: string) {
  const c = cuando(ds);
  return c.startsWith("el ") ? `del ${c.slice(3)}` : `de ${c}`;
}

// Avisos al cliente por WhatsApp. El dueño toca y solo aprieta enviar: wa.me NO
// puede mandar solo, siempre hay una persona apretando. Para el cliente el
// mensaje llega del número del local, no de un bot.
/** Cómo salió el mail automático al cliente. */
export type EstadoMail = "enviando" | "enviado" | "sin-email" | "fallo";

export type Aviso = {
  tipo: "movido" | "cancelado";
  clientName: string; clientPhone: string; serviceName: string;
  date: string; time: string; token: string; slug: string;
  /** Sólo aplica a "movido": el cancelado se sigue avisando a mano. */
  mail?: EstadoMail;
};

function waAviso(a: Aviso) {
  const pila = a.clientName.trim().split(/\s+/)[0];
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // El link cambia según el caso, y no es un detalle:
  //   movido    → al turno, para que lo cambie o cancele si no le sirve.
  //   cancelado → a la reserva, porque su turno ya no existe y lo que necesita
  //               es sacar otro.
  const texto =
    a.tipo === "movido"
      ? `Hola ${pila}! Te muevo el turno de ${a.serviceName} para ${cuando(a.date)} a las ${a.time}.

` +
        `Si no te sirve, avisame o cambialo acá: ${origin}/t/${a.token}`
      : `Hola ${pila}! Tengo que cancelar tu turno de ${a.serviceName} ${deCuando(a.date)} a las ${a.time}. Perdón por el inconveniente.

` +
        `Cuando quieras sacás otro acá: ${origin}/${a.slug}`;

  return waLink(a.clientPhone, texto);
}

// Recordatorio. El cierre —"así libero el horario"— no es cortesía: es lo que
// hace que el cliente CANCELE en vez de faltar. Un horario liberado se revende;
// un no-show es plata perdida y el sillón vacío.
function waRecordatorio(a: {
  client_name: string; client_phone: string; date: string; time: string; token: string;
  services: { name: string } | null;
}) {
  const pila = a.client_name.trim().split(/\s+/)[0];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return waLink(
    a.client_phone,
    `Hola ${pila}! Te recuerdo tu turno de ${a.services?.name ?? "siempre"} ${deCuando(a.date)} a las ${a.time.slice(0, 5)}.

` +
      `Si no podés venir, avisame así libero el horario: ${origin}/t/${a.token}`
  );
}

export default function PanelPage() {
  const supabase = createClient();
  const router = useRouter();

  const [shop, setShop] = useState<Shop | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  // Días en que cada persona del equipo no está: "staffId|YYYY-MM-DD"
  const [absences, setAbsences] = useState<Set<string>>(new Set());
  const [staffFilter, setStaffFilter] = useState<string | null>(null); // null = todos
  const [date, setDate] = useState(fmtDate(new Date()));
  const [copied, setCopied] = useState(false);
  const [bajando, setBajando] = useState(false);

  // Cargar un turno a mano (el que se cerró por teléfono, al mostrador o por
  // WhatsApp). Sin esto, esos turnos no existen y no entran en ningún número.
  const [services, setServices] = useState<Svc[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [nvSvc, setNvSvc] = useState<Svc | null>(null);
  const [nvStaff, setNvStaff] = useState<string | null>(null);
  const [nvFecha, setNvFecha] = useState("");
  const [nvHora, setNvHora] = useState<string | null>(null);
  const [nvNombre, setNvNombre] = useState("");
  const [nvTel, setNvTel] = useState("");
  const [nvBusy, setNvBusy] = useState<MoveBusy[]>([]);
  const [nvSaving, setNvSaving] = useState(false);
  const [nvError, setNvError] = useState("");
  const [loadErr, setLoadErr] = useState(false);

  // Reprogramar turno ("mover")
  const [moving, setMoving] = useState<Appt | null>(null);
  const [schedInfo, setSchedInfo] = useState<SchedInfo | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [moveTime, setMoveTime] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState<MoveBusy[]>([]);
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState("");

  // Datos del turno recién movido o cancelado, para el paso "avisale al
  // cliente". Mientras esto está seteado el sheet muestra ese paso: mover o
  // cancelar sin avisar deja al cliente viajando al pedo, así que el aviso no
  // puede ser algo que se cierre de casualidad.
  const [avisar, setAvisar] = useState<Aviso | null>(null);

  // Turno que el dueño quiere cancelar, esperando confirmación. Antes el ✕
  // cancelaba de una: un toque mal dado borraba el turno de un cliente, sin
  // vuelta atrás y sin que nadie se enterara.
  const [cancelando, setCancelando] = useState<Appt | null>(null);
  const [cancelSaving, setCancelSaving] = useState(false);

  const days = useMemo(() => getNext7Days(), []);
  const today = fmtDate(new Date());

  useEffect(() => {
    async function init() {
      try {
        const { data: userData, error: uErr } = await supabase.auth.getUser();
        if (uErr) throw uErr;
        if (!userData.user) return router.push("/login");
        const { data, error: sErr } = await supabase.from("businesses").select("id, name, slug").maybeSingle();
        if (sErr) throw sErr;
        if (!data) return router.push("/onboarding");
        setShop(data);

        // Equipo del local (vacío = una sola agenda, todo como antes)
        const { data: brs } = await supabase
          .from("staff").select("id, name")
          .eq("business_id", data.id).eq("active", true).order("sort_order");
        const list = (brs ?? []) as StaffMember[];
        setStaff(list);

        if (list.length > 0) {
          const { data: abs } = await supabase
            .from("staff_absences").select("staff_id, date")
            .in("staff_id", list.map((b) => b.id))
            .gte("date", fmtDate(new Date()));
          setAbsences(new Set((abs ?? []).map((a) => `${a.staff_id}|${a.date}`)));
        }

        // Servicios + quién hace cada uno, para el alta manual de turnos.
        const { data: svcs } = await supabase
          .from("services").select("id, name, duration_min, price")
          .eq("business_id", data.id).eq("active", true).order("sort_order");
        const { data: asign } = await supabase
          .from("service_staff").select("service_id, staff_id");
        setServices((svcs ?? []).map((s) => ({
          id: s.id as string, name: s.name as string,
          duration_min: s.duration_min as number, price: s.price as number,
          staff_ids: (asign ?? []).filter((a) => a.service_id === s.id).map((a) => a.staff_id as string),
        })));

        // Marcar como atendidos los turnos confirmados de días pasados
        await supabase
          .from("appointments")
          .update({ status: "done" })
          .eq("business_id", data.id)
          .eq("status", "confirmed")
          .lt("date", fmtDate(new Date()));
      } catch {
        // Antes: si esto fallaba, quedaba en "Cargando…" eterno sin explicar nada.
        setLoadErr(true);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAppts(shopId: string, onDate: string) {
    const { data } = await supabase
      .from("appointments")
      .select("id, client_name, client_phone, date, time, status, token, staff_id, price, service_name, services(name, duration_min)")
      .eq("business_id", shopId).eq("date", onDate).order("time");
    setAppts((data as unknown as Appt[]) ?? []);
  }

  // Carga inicial y recarga al cambiar de día.
  //
  // El disable es a conciencia, no para tapar el error: `loadAppts` es async y
  // su setAppts ocurre DESPUÉS del await, o sea después de que vuelve la red.
  // Eso no es el render en cascada que la regla busca evitar — es un fetch, que
  // es exactamente para lo que existe useEffect. El linter no puede ver a través
  // del await y marca falso positivo.
  //
  // Si algún día loadAppts pasa a hacer setState de forma SÍNCRONA (por ejemplo
  // un setLoading(true) al principio), este disable deja de ser válido y hay que
  // rever el caso.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (shop) loadAppts(shop.id, date); }, [shop, date]);

  // ── AUTO-REFRESCO (polling) ──────────────────────────────────────────────
  // Ves turnos nuevos sin recargar la página. Encapsulado ACÁ a propósito: el
  // día que Turnito escale y necesite Realtime (WebSocket), se reemplaza SOLO
  // este bloque, sin tocar el resto del panel.
  useEffect(() => {
    if (!shop) return;
    const tick = () => loadAppts(shop.id, date);
    const id = setInterval(tick, 5000); // cada 5s: se siente "vivo" y para un local sobra
    // Bonus: al volver a la pestaña, refresca al toque.
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, date]);

  async function setStatus(id: string, status: string) {
    await supabase.from("appointments").update({ status }).eq("id", id);
    if (shop) loadAppts(shop.id, date);
  }

  // Atajo: los últimos 30 días sin salir del panel. El armado del archivo vive
  // en lib/csv.ts, compartido con la pantalla de números.
  async function bajarUltimos30() {
    if (!shop || bajando) return;
    setBajando(true);
    try {
      const hasta = new Date();
      const desde = new Date();
      desde.setDate(desde.getDate() - 30);

      const { data } = await supabase
        .from("appointments")
        .select("date, time, status, client_name, client_phone, service_name, price, staff_id")
        .eq("business_id", shop.id)
        .gte("date", fmtDate(desde))
        .lte("date", fmtDate(hasta))
        .order("date").order("time");

      descargarCsv(
        turnosACsv((data ?? []) as FilaTurno[], staffName),
        `turnito-${shop.slug}-${fmtDate(desde)}-a-${fmtDate(hasta)}.csv`
      );
    } finally {
      setBajando(false);
    }
  }

  function copyLink() {
    if (!shop) return;
    navigator.clipboard.writeText(`${window.location.origin}/${shop.slug}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  // ── REPROGRAMAR TURNO ─────────────────────────────────────────────────────
  async function openMove(appt: Appt) {
    setMoving(appt); setMoveDate(appt.date); setMoveTime(null); setMoveError("");
    // Traemos la agenda (horarios/cerrados) igual que la reserva pública, una sola vez.
    if (!schedInfo && shop) {
      const { data } = await supabase.rpc("public_shop_info", { shop_slug: shop.slug });
      if (data) setSchedInfo(data as SchedInfo);
    }
  }
  function closeSheet() { setMoving(null); setMoveTime(null); setAvisar(null); setCancelando(null); }
  const closeMove = closeSheet;

  // Cancelar de verdad, ya confirmado. Igual que al mover: no cierra, pasa al
  // paso de avisarle.
  async function confirmCancel() {
    if (!cancelando || !shop) return;
    setCancelSaving(true);
    const { error } = await supabase.from("appointments")
      .update({ status: "cancelled_by_shop" }).eq("id", cancelando.id);
    setCancelSaving(false);
    if (error) return;

    setAvisar({
      tipo: "cancelado",
      clientName: cancelando.client_name,
      clientPhone: cancelando.client_phone,
      serviceName: cancelando.service_name ?? cancelando.services?.name ?? "tu turno",
      date: cancelando.date,
      time: cancelando.time.slice(0, 5),
      token: cancelando.token,
      slug: shop.slug,
    });
    setCancelando(null);
    loadAppts(shop.id, date);
  }

  // Turnos ocupados del día destino (para validar solapamiento)
  useEffect(() => {
    if (!moving || !shop) return;
    supabase.from("appointments")
      .select("id, time, staff_id, services(duration_min)")
      .eq("business_id", shop.id).eq("date", moveDate).in("status", ["confirmed", "done"])
      .then(({ data }) => setMoveBusy((data as unknown as MoveBusy[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, moveDate, shop]);

  const moveFullDayClosed = useMemo(
    () => fullDayClosedSet(normalizeClosed(schedInfo?.closed)),
    [schedInfo]
  );

  // Días en que NO se puede mover este turno: local cerrado o esa persona ausente.
  const moveDayBlocked = (ds: string) =>
    moveFullDayClosed.has(ds) || (!!moving?.staff_id && absences.has(`${moving.staff_id}|${ds}`));

  // Horarios libres de un día para UNA agenda.
  //
  // Estaba escrito adentro de "mover turno". Se factorizó al sumar el alta
  // manual: son dos pantallas que eligen horario y tienen que aplicar la misma
  // regla de solapamiento. Dos copias divergen, y el día que diverjan van a
  // aparecer turnos pisados que nadie entiende de dónde salieron.
  const calcularSlots = useCallback((o: {
    fecha: string;
    staffId: string | null;
    duracion: number;
    ocupados: MoveBusy[];
    /** El turno que se está moviendo: no compite consigo mismo. */
    excluirId?: string;
  }) => {
    const vacio = { grid: [] as string[], availability: {} as Record<string, boolean> };
    if (!schedInfo) return vacio;
    if (moveFullDayClosed.has(o.fecha)) return vacio;
    if (o.staffId && absences.has(`${o.staffId}|${o.fecha}`)) return vacio;
    const [y, m, d] = o.fecha.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    // Con varias agendas sólo compiten los turnos de la misma persona; los de
    // staff_id null son de la época de un solo sillón y ocupan a todos.
    const busyIntervals = o.ocupados
      .filter((a) => a.id !== o.excluirId)
      .filter((a) => !o.staffId || a.staff_id === null || a.staff_id === o.staffId)
      .map((a) => { const s = toMin(a.time); return [s, s + (a.services?.duration_min ?? schedInfo.slot_minutes)] as [number, number]; });
    // Desde el panel NO hay anticipación mínima: el local puede anotar algo que
    // pasa en diez minutos. Lo único que no se permite es el pasado.
    let minStartMin: number | undefined;
    if (o.fecha === today) { const now = new Date(); minStartMin = now.getHours() * 60 + now.getMinutes(); }
    return computeSlots({
      hours: schedInfo.hours, weekday, date: o.fecha,
      slotMinutes: schedInfo.slot_minutes, durationMin: o.duracion,
      closedBlocks: normalizeClosed(schedInfo.closed), busyIntervals, minStartMin,
    });
  }, [schedInfo, moveFullDayClosed, absences, today]);

  const moveSlots = useMemo(() => {
    if (!moving || !schedInfo) return { grid: [] as string[], availability: {} as Record<string, boolean> };
    return calcularSlots({
      fecha: moveDate,
      staffId: moving.staff_id,
      duracion: moving.services?.duration_min ?? schedInfo.slot_minutes,
      ocupados: moveBusy,
      excluirId: moving.id,
    });
  }, [moving, schedInfo, moveDate, moveBusy, calcularSlots]);

  const nvSlots = useMemo(() => {
    if (!nvSvc) return { grid: [] as string[], availability: {} as Record<string, boolean> };
    return calcularSlots({
      fecha: nvFecha, staffId: nvStaff, duracion: nvSvc.duration_min, ocupados: nvBusy,
    });
  }, [nvSvc, nvFecha, nvStaff, nvBusy, calcularSlots]);

  // Quiénes pueden atender el servicio elegido. Misma regla que la web pública.
  const nvElegibles = useMemo(() => {
    if (!nvSvc || nvSvc.staff_ids.length === 0) return staff;
    return staff.filter((b) => nvSvc.staff_ids.includes(b.id));
  }, [nvSvc, staff]);

  async function confirmMove() {
    if (!moving || !moveTime) return;
    setMoveSaving(true); setMoveError("");
    const { error } = await supabase.from("appointments")
      .update({ date: moveDate, time: moveTime }).eq("id", moving.id);
    setMoveSaving(false);
    if (error) {
      setMoveError(error.code === "23505" ? "Ese horario se acaba de ocupar. Elegí otro." : "No se pudo mover. Probá de nuevo.");
      return;
    }
    // De dónde lo sacamos, para que el mail pueda decir qué cambió. Se lee
    // ANTES de que el sheet se reacomode: `moving` apunta al turno viejo.
    const apptId = moving.id;
    const antesDate = moving.date;
    const antesTime = moving.time;

    // NO cerramos: pasamos al paso de avisarle al cliente. Antes esto cerraba el
    // sheet y el cliente nunca se enteraba de que le movieron el turno.
    setAvisar({
      tipo: "movido",
      clientName: moving.client_name,
      clientPhone: moving.client_phone,
      serviceName: moving.service_name ?? moving.services?.name ?? "tu turno",
      date: moveDate,
      time: moveTime,
      token: moving.token,
      slug: shop?.slug ?? "",
      mail: "enviando",
    });
    setMoveTime(null);
    if (shop) loadAppts(shop.id, date);

    // El mail va en paralelo y sin await: el dueño no tiene por qué esperar a
    // Mailjet para poder mandarle el WhatsApp. El turno ya está movido, así que
    // si esto falla no se pierde nada — se avisa a mano, como hasta ahora.
    fetch("/api/notify-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: apptId, oldDate: antesDate, oldTime: antesTime }),
    })
      .then((r) => r.json())
      .then((r: { sent?: boolean; reason?: string }) => {
        const estado: EstadoMail = r.sent ? "enviado" : r.reason === "sin-email" ? "sin-email" : "fallo";
        setAvisar((prev) => (prev ? { ...prev, mail: estado } : prev));
      })
      .catch(() => setAvisar((prev) => (prev ? { ...prev, mail: "fallo" } : prev)));
  }

  // ── CARGAR TURNO A MANO ───────────────────────────────────────────────────
  function abrirNuevo() {
    setNuevo(true); setNvError(""); setNvHora(null);
    setNvNombre(""); setNvTel(""); setNvSvc(null); setNvStaff(null);
    setNvFecha(date);
    if (!schedInfo && shop) {
      supabase.rpc("public_shop_info", { shop_slug: shop.slug })
        .then(({ data }) => { if (data) setSchedInfo(data as SchedInfo); });
    }
  }

  // Ocupados del día elegido, para que la grilla no ofrezca horarios pisados.
  useEffect(() => {
    if (!nuevo || !shop || !nvFecha) return;
    supabase.from("appointments")
      .select("id, time, staff_id, services(duration_min)")
      .eq("business_id", shop.id).eq("date", nvFecha).in("status", ["confirmed", "done"])
      .then(({ data }) => setNvBusy((data as unknown as MoveBusy[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevo, shop, nvFecha]);

  async function guardarNuevo() {
    if (!shop || !nvSvc || !nvHora) return;
    if (nvNombre.trim().length < 3) return setNvError("Escribí el nombre del cliente.");
    if (nvTel.trim().length < 7) return setNvError("Falta el teléfono.");
    if (nvElegibles.length > 0 && !nvStaff) return setNvError("Elegí quién lo atiende.");

    setNvSaving(true); setNvError("");
    // Precio y nombre congelados, igual que en /api/book: si mañana sube la
    // lista, este turno tiene que seguir valiendo lo de hoy.
    const { error } = await supabase.from("appointments").insert({
      business_id: shop.id,
      service_id: nvSvc.id,
      ...(nvStaff ? { staff_id: nvStaff } : {}),
      date: nvFecha,
      time: nvHora,
      client_name: nvNombre.trim(),
      client_phone: nvTel.trim(),
      price: nvSvc.price,
      service_name: nvSvc.name,
    });
    setNvSaving(false);

    if (error) {
      if (error.code === "23505") return setNvError("Ese horario se acaba de ocupar. Elegí otro.");
      // El cupo por negocio lo levanta el trigger de 0006. Es rarísimo que un
      // local lo toque cargando a mano, pero si pasa hay que decirlo claro.
      if (error.message.includes("BOOKING_CAP")) {
        return setNvError("Llegaste al tope de turnos del día. Escribinos si necesitás más.");
      }
      return setNvError("No se pudo guardar. Probá de nuevo.");
    }
    setNuevo(false);
    setDate(nvFecha);
    loadAppts(shop.id, nvFecha);
  }

  const staffName = (id: string | null) => staff.find((b) => b.id === id)?.name ?? null;
  // Filtro por persona: null = todos. Los turnos viejos (staff_id null) sólo
  // aparecen en "Todos", que es donde tiene sentido verlos.
  const shownAppts = staffFilter ? appts.filter((a) => a.staff_id === staffFilter) : appts;

  const active = shownAppts.filter((a) => a.status === "confirmed");
  const done = shownAppts.filter((a) => a.status === "done");

  // Números del día. Salen de `shownAppts`, así que respetan el filtro por
  // persona: si el dueño filtra por un barbero, ve lo que hizo ese barbero.
  // Y como el panel ya refresca cada 5s, se mueven solos: marcás un corte como
  // atendido y la plata sube en el acto, sin recargar nada.
  const resumen = useMemo(() => {
    const cobrado = done.reduce((t, a) => t + (a.price ?? 0), 0);
    const porCobrar = active.reduce((t, a) => t + (a.price ?? 0), 0);
    // Turnos anteriores a la migración del precio: no los contamos como $0
    // callados, avisamos que el total les queda corto.
    const sinPrecio = done.filter((a) => a.price == null).length;
    return {
      cobrado, porCobrar, sinPrecio,
      ausencias: shownAppts.filter((a) => a.status === "no_show").length,
    };
  }, [done, active, shownAppts]);

  const fmtPesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

  const current = active[0] ?? null;
  const rest = active.slice(1);

  // ¿Hay algo para poner en la segunda columna? Si no, no la abrimos.
  const hayCola = rest.length > 0 || done.length > 0;

  if (loadErr)
    return (
      <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <p className="text-lg font-bold text-ink">No pudimos cargar tu panel</p>
          <p className="text-[15px] text-muted mt-1 mb-5">Puede ser un problema de conexión. Probá de nuevo.</p>
          <button onClick={() => window.location.reload()}
            className="rounded-full bg-accent text-on-accent font-bold text-lg px-6 py-3">
            Reintentar
          </button>
        </div>
      </main>
    );

  if (!shop)
    return (
      <main className="min-h-screen bg-canvas p-5 lg:p-8">
        <div className="max-w-md lg:max-w-6xl mx-auto pb-16 animate-pulse">
          <div className="flex items-center justify-between pt-2 mb-6">
            <div className="h-6 w-40 rounded-lg bg-surface" />
            <div className="h-4 w-16 rounded bg-line" />
          </div>
          <div className="flex gap-2 mb-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-12 h-14 rounded-2xl bg-surface" />)}
          </div>
          <div className="h-40 rounded-3xl bg-surface mb-4" />
          <div className="h-16 rounded-2xl bg-surface mb-2" />
          <div className="h-16 rounded-2xl bg-surface" />
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-canvas text-body p-5 lg:p-8">
      <div className="max-w-md lg:max-w-6xl mx-auto pb-16">
        {/* header */}
        <motion.div className="flex items-center justify-between pt-2 mb-1"
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div className="flex items-center gap-2.5"><LogoMark size={22} /><h1 className="text-[22px] font-extrabold text-ink tracking-tight">{shop.name}</h1></div>
          <div className="flex items-center">
            <ThemeToggle className="mr-2.5" />
            <Link href="/panel/stats" className="text-[14px] text-accent-ink font-bold mr-3">📊 Números</Link>
            <Link href="/panel/config" className="text-[14px] text-accent-ink font-bold mr-3">⚙ Config</Link>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }} className="text-[14px] text-faint underline">Salir</button>
          </div>
        </motion.div>
        <button onClick={copyLink} className="text-[14px] font-mono text-muted block">
          {SITE_DOMAIN}/{shop.slug} <span className={copied ? "text-accent-ink font-bold" : "text-faint"}>{copied ? "✓ copiado" : "· copiar"}</span>
        </button>

        {/* El link se fija al crear la cuenta y no sigue al nombre: ya está en
            la bio de Instagram, en estados de WhatsApp y en el historial de los
            clientes, y cambiarlo los rompería a todos sin aviso.
            La aclaración aparece SÓLO cuando dejaron de coincidir. Si el local
            se sigue llamando igual que su link, no hay nada que explicar y una
            línea fija ahí sería ruido permanente. */}
        {slugify(shop.name) !== shop.slug && (
          <p className="text-[13px] text-faint mt-1.5 max-w-sm leading-relaxed">
            Tu link quedó fijo desde que creaste la cuenta y no cambia con el nombre,
            para no romper el que ya compartiste con tus clientes.
          </p>
        )}

        <div className="mb-6" />

        {/* días */}
        <motion.div className="flex gap-2 overflow-x-auto pb-2 mb-6"
          initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
          {days.map((d) => {
            const ds = fmtDate(d); const on = date === ds;
            return (
              <motion.button key={ds} onClick={() => setDate(ds)}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                whileTap={{ scale: 0.92 }}
                className={`shrink-0 w-12 rounded-2xl border-[1.5px] py-2 text-center transition-colors ${on ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
                <div className={`text-[11px] uppercase font-semibold ${on ? "text-accent-ink" : "text-faint"}`}>{ds === today ? "Hoy" : DAYS_ES[d.getDay()]}</div>
                <div className={`text-lg font-bold ${on ? "text-accent-ink" : "text-ink"}`}>{d.getDate()}</div>
              </motion.button>
            );
          })}
        </motion.div>

        {/* filtro por persona (sólo si el local cargó equipo) */}
        {staff.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            <button onClick={() => setStaffFilter(null)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-bold transition-colors ${
                staffFilter === null ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"}`}>
              Todos
            </button>
            {staff.map((b) => {
              const off = absences.has(`${b.id}|${date}`);
              return (
                <button key={b.id} onClick={() => setStaffFilter(b.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-bold transition-colors ${
                    staffFilter === b.id ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"}`}>
                  {b.name}{off ? " · libre" : ""}
                </button>
              );
            })}
          </div>
        )}

        {/* Dos columnas desde lg. En un monitor de local, lo que se mira de
            lejos es el turno que viene; la cola se escanea de cerca. Por eso el
            "siguiente" queda fijo a la izquierda y la lista scrollea al lado.
            En mobile el grid no aplica y el orden es el de siempre.
            Sin cola no abrimos la segunda columna: media pantalla vacía al lado
            de una tarjeta suelta se lee como que algo se rompió, no como un día
            tranquilo. Ahí volvemos a una sola columna centrada. */}
        <div className={hayCola
          ? "lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-7 lg:items-start"
          : "lg:max-w-md lg:mx-auto"}>
        <div className={hayCola ? "lg:sticky lg:top-6" : ""}>

        <div className="flex justify-between items-baseline mb-3">
          <span className="text-lg font-bold text-ink">{date === today ? "Hoy" : date}</span>
          <span className="text-[14px] text-faint">{done.length} atendidos · {active.length} en cola</span>
        </div>

        <motion.button whileTap={{ scale: 0.97 }} onClick={abrirNuevo}
          className="w-full rounded-2xl border-[1.5px] border-dashed border-line text-lg font-bold text-accent-ink py-3 mb-4 transition-colors hover:border-accent">
          + Cargar un turno
        </motion.button>

        {/* Números del día. El de la izquierda es el que importa: se mueve en el
            momento en que marcás un turno como atendido. */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="rounded-2xl bg-surface border border-line p-3">
            <div className="text-[12px] uppercase font-bold tracking-widest text-faint mb-1">Cobrado</div>
            <motion.div key={resumen.cobrado}
              initial={{ scale: 0.88, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="text-[22px] font-extrabold text-ink tabular-nums leading-none">
              {fmtPesos(resumen.cobrado)}
            </motion.div>
            <div className="text-[13px] text-faint mt-1">{done.length} atendidos</div>
          </div>

          <div className="rounded-2xl bg-surface border border-line p-3">
            <div className="text-[12px] uppercase font-bold tracking-widest text-faint mb-1">Por cobrar</div>
            <div className="text-[22px] font-extrabold text-muted tabular-nums leading-none">
              {fmtPesos(resumen.porCobrar)}
            </div>
            <div className="text-[13px] text-faint mt-1">{active.length} en cola</div>
          </div>

          <div className="rounded-2xl bg-surface border border-line p-3">
            <div className="text-[12px] uppercase font-bold tracking-widest text-faint mb-1">Ausencias</div>
            <div className={`text-[22px] font-extrabold tabular-nums leading-none ${resumen.ausencias > 0 ? "text-danger" : "text-muted"}`}>
              {resumen.ausencias}
            </div>
            <div className="text-[13px] text-faint mt-1">no vinieron</div>
          </div>
        </div>


        {resumen.sinPrecio > 0 && (
          <p className="text-[13px] text-faint -mt-3 mb-5">
            {resumen.sinPrecio === 1 ? "Hay 1 turno atendido sin" : `Hay ${resumen.sinPrecio} turnos atendidos sin`}{" "}
            precio guardado, así que el total les queda corto.
          </p>
        )}

        {/* SIGUIENTE */}
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div key={current.id}
              initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -12 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="rounded-3xl bg-highlight text-on-highlight p-5 mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-black text-highlight text-[11px] font-black tracking-[0.15em] px-3.5 py-1.5 rounded-bl-2xl">SIGUIENTE</div>
              <div className="flex items-center gap-4">
                <div className="text-[33px] font-extrabold tracking-tight">{current.time.slice(0, 5)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[22px] font-bold truncate">{current.client_name}</div>
                  <div className="text-[15px] opacity-75 mt-0.5">
                    {current.services?.name} · {formatDuracion(current.services?.duration_min ?? 0)}
                    {staffName(current.staff_id) ? ` · con ${staffName(current.staff_id)}` : ""} ·{" "}
                    {/* Teléfono → abre WhatsApp */}
                    <a href={waLink(current.client_phone)} target="_blank" rel="noopener noreferrer"
                      className="underline font-semibold">
                      💬 {current.client_phone}
                    </a>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} onClick={() => setStatus(current.id, "done")}
                  className="flex-1 rounded-full bg-black text-white font-bold text-lg py-3">✓ Listo, siguiente</motion.button>
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => setStatus(current.id, "no_show")}
                  className="rounded-full border-[1.5px] border-black/25 text-on-highlight text-[15px] font-bold px-5">No vino</motion.button>
              </div>
              <a href={waRecordatorio(current)} target="_blank" rel="noopener noreferrer"
                className="block w-full text-center text-[14px] font-bold text-on-highlight/55 mt-2.5 underline underline-offset-2">
                🔔 Recordarle
              </a>
              <button onClick={() => openMove(current)}
                className="w-full text-center text-[14px] font-bold text-on-highlight/55 mt-2.5 underline underline-offset-2">
                🕐 Mover a otro horario
              </button>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-line bg-surface p-8 text-center mb-4">
              {shownAppts.length === 0 ? (
                <>
                  <div className="text-[33px] mb-3">📅</div>
                  <p className="text-lg font-bold text-ink">Todavía no hay turnos este día</p>
                  <p className="text-[15px] text-faint mt-1 mb-5">Compartí tu link para recibir el primero</p>
                  <motion.button whileTap={{ scale: 0.96 }} onClick={copyLink}
                    className="rounded-full bg-accent text-on-accent font-bold text-lg px-6 py-2.5">
                    {copied ? "✓ Link copiado" : "Copiar mi link"}
                  </motion.button>
                </>
              ) : (
                <>
                  <div className="text-[33px] mb-3">🎉</div>
                  <p className="text-lg font-bold text-ink">¡Día completado!</p>
                  <p className="text-[15px] text-faint mt-1">Atendiste todos los turnos. Bien ahí.</p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Descarga: acción de una vez por mes. Va al pie y en gris para que no
            le compita a la tarjeta del turno que viene, que se mira todo el día. */}
        <button onClick={bajarUltimos30} disabled={bajando}
          className="w-full rounded-2xl border border-line bg-surface text-[14px] font-bold text-muted py-2.5 mt-1 mb-5 transition-colors hover:border-accent hover:text-accent-ink disabled:opacity-50">
          {bajando ? "Preparando…" : "↓ Descargar los últimos 30 días"}
        </button>

        </div>{/* fin columna izquierda */}
        <div>

        {/* SIGUEN DESPUÉS */}
        {rest.length > 0 && (
          <>
            <SectionLabel>Después siguen</SectionLabel>
            <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
              <AnimatePresence>
                {rest.map((a, i) => (
                  <motion.div key={a.id} layout
                    variants={{ hidden: { opacity: 0, x: 20 }, show: { opacity: 1, x: 0 } }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-3 rounded-2xl bg-surface border border-line px-4 py-3 mb-2">
                    <div className="w-6 h-6 rounded-full bg-canvas border border-line text-muted text-[13px] font-bold flex items-center justify-center shrink-0">{i + 2}</div>
                    <div className="font-mono text-lg font-bold w-16 text-accent-ink">{a.time.slice(0, 5)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-bold truncate text-ink">{a.client_name}</div>
                      <div className="text-[13px] text-faint">
                        {a.services?.name}
                        {staffName(a.staff_id) ? ` · ${staffName(a.staff_id)}` : ""} ·{" "}
                        <a href={waLink(a.client_phone)} target="_blank" rel="noopener noreferrer"
                          className="underline text-muted hover:text-accent-ink">
                          💬 {a.client_phone}
                        </a>
                      </div>
                    </div>
                    <a href={waRecordatorio(a)} target="_blank" rel="noopener noreferrer"
                      className="text-faint hover:text-accent-ink text-lg px-1" title="Recordarle el turno">🔔</a>
                    <button onClick={() => openMove(a)} className="text-faint hover:text-accent-ink text-lg px-1" title="Mover turno">🕐</button>
                    <button onClick={() => setCancelando(a)} className="text-faint hover:text-danger text-lg px-1" title="Cancelar turno">✕</button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </>
        )}

        {/* YA ATENDIDOS */}
        {done.length > 0 && (
          <>
            <SectionLabel className="mt-6">Ya atendidos</SectionLabel>
            {done.map((a) => (
              <motion.div key={a.id} layout initial={{ opacity: 0 }} animate={{ opacity: 0.5 }}
                className="flex items-center gap-3 px-4 py-2">
                <span className="text-accent-ink text-lg">✓</span>
                <span className="font-mono text-[15px] w-14">{a.time.slice(0, 5)}</span>
                <span className="text-lg line-through">{a.client_name}</span>
              </motion.div>
            ))}
          </>
        )}

        </div>{/* fin columna derecha */}
        </div>{/* fin grid */}
      </div>

      {/* MODAL CARGAR TURNO A MANO */}
      <AnimatePresence>
        {nuevo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setNuevo(false)}
            className="fixed inset-0 z-50 bg-black/45 flex items-end lg:items-center justify-center">
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface rounded-t-3xl lg:rounded-3xl p-5 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-extrabold text-ink">Cargar un turno</h2>
                <button onClick={() => setNuevo(false)} className="text-faint text-[22px] leading-none px-1">✕</button>
              </div>
              <p className="text-[14px] text-faint mb-4">
                Para lo que se cerró por teléfono, al mostrador o por WhatsApp. Queda igual
                que un turno reservado por la web y suma en los números del día.
              </p>

              <SectionLabel>Servicio</SectionLabel>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {services.map((s) => (
                  <button key={s.id}
                    onClick={() => { setNvSvc(s); setNvHora(null); setNvStaff(null); }}
                    className={`rounded-2xl border-[1.5px] p-2.5 text-center transition-colors ${
                      nvSvc?.id === s.id ? "border-accent bg-accent-soft" : "border-line bg-canvas"
                    }`}>
                    <div className="text-[14px] font-bold text-ink truncate">{s.name}</div>
                    <div className="text-[13px] text-faint mt-0.5">{formatDuracion(s.duration_min)}</div>
                  </button>
                ))}
              </div>

              {nvSvc && nvElegibles.length > 0 && (
                <>
                  <SectionLabel>Quién atiende</SectionLabel>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {nvElegibles.map((b) => (
                      <button key={b.id} onClick={() => { setNvStaff(b.id); setNvHora(null); }}
                        className={`rounded-2xl border-[1.5px] p-2.5 text-center transition-colors ${
                          nvStaff === b.id ? "border-accent bg-accent-soft" : "border-line bg-canvas"
                        }`}>
                        <div className="text-[14px] font-bold text-ink truncate">{b.name}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <SectionLabel>Día</SectionLabel>
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                {days.map((d) => {
                  const ds = fmtDate(d);
                  const on = nvFecha === ds;
                  return (
                    <button key={ds} onClick={() => { setNvFecha(ds); setNvHora(null); }}
                      className={`shrink-0 w-12 rounded-2xl border-[1.5px] py-2 text-center transition-colors ${
                        on ? "border-accent bg-accent-soft" : "border-line bg-canvas"}`}>
                      <div className={`text-[11px] uppercase font-semibold ${on ? "text-accent-ink" : "text-faint"}`}>
                        {ds === today ? "Hoy" : DAYS_ES[d.getDay()]}
                      </div>
                      <div className={`text-lg font-bold ${on ? "text-accent-ink" : "text-ink"}`}>{d.getDate()}</div>
                    </button>
                  );
                })}
              </div>

              <SectionLabel>Horario</SectionLabel>
              {!nvSvc ? (
                <p className="text-[15px] text-faint mb-4">Elegí primero el servicio.</p>
              ) : nvElegibles.length > 0 && !nvStaff ? (
                <p className="text-[15px] text-faint mb-4">Elegí quién lo atiende para ver sus horarios.</p>
              ) : nvSlots.grid.length === 0 ? (
                <p className="text-[15px] text-faint mb-4">No hay horarios ese día. Probá con otro.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {nvSlots.grid.map((s) => {
                    const libre = nvSlots.availability[s];
                    return (
                      <button key={s} disabled={!libre} onClick={() => setNvHora(s)}
                        className={`rounded-xl border-[1.5px] py-2 text-[14px] font-bold transition-colors ${
                          !libre ? "border-dashed border-line text-faint line-through"
                            : nvHora === s ? "border-accent bg-accent text-on-accent"
                            : "border-line bg-canvas text-body"}`}>{s}</button>
                    );
                  })}
                </div>
              )}

              <SectionLabel>Cliente</SectionLabel>
              <input value={nvNombre} onChange={(e) => setNvNombre(e.target.value)} placeholder="Nombre y apellido"
                className="w-full rounded-2xl bg-canvas border border-line px-4 py-3 text-lg outline-none focus:border-accent mb-2" />
              <input value={nvTel} onChange={(e) => setNvTel(e.target.value)} placeholder="351 234-5678" type="tel"
                className="w-full rounded-2xl bg-canvas border border-line px-4 py-3 text-lg outline-none focus:border-accent mb-4" />

              {nvError && <p className="text-lg text-danger mb-3 text-center">{nvError}</p>}

              <motion.button whileTap={{ scale: 0.97 }} onClick={guardarNuevo}
                disabled={!nvHora || nvSaving}
                className="w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity">
                {nvSaving ? "Guardando…" : "Guardar turno"}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SHEET: mover · cancelar · avisar. Uno solo para los tres pasos, así el
          aviso al cliente se ve igual venga de donde venga. */}
      <AnimatePresence>
        {(moving || cancelando || avisar) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeMove}
            className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center">
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-extrabold text-ink">
                  {avisar ? (avisar.tipo === "movido" ? "Turno movido" : "Turno cancelado")
                    : cancelando ? "¿Cancelar el turno?" : "Mover turno"}
                </h2>
                <button onClick={closeSheet} className="text-faint text-[22px] leading-none px-1">✕</button>
              </div>
              <p className="text-[15px] text-muted mb-4">
                {(() => {
                  const a = moving ?? cancelando;
                  if (a) return `${a.client_name} · ${a.services?.name} (${formatDuracion(a.services?.duration_min ?? 0)})${staffName(a.staff_id) ? ` · con ${staffName(a.staff_id)}` : ""}`;
                  return `${avisar?.clientName} · ${avisar?.serviceName}`;
                })()}
              </p>

              {cancelando ? (
                /* Paso 1 del cancelar: confirmar. El ✕ cancelaba de una. */
                <div className="py-2">
                  <p className="text-lg text-ink mb-1">
                    {cuando(cancelando.date)} a las <span className="font-bold">{cancelando.time.slice(0, 5)}</span>
                  </p>
                  <p className="text-[15px] text-muted mb-5">
                    El horario queda libre y se lo vas a poder avisar al cliente en el paso siguiente.
                  </p>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={confirmCancel} disabled={cancelSaving}
                    className="w-full rounded-full bg-danger text-white font-bold py-3.5 disabled:opacity-40 mb-3">
                    {cancelSaving ? "Cancelando…" : "Sí, cancelar el turno"}
                  </motion.button>
                  <button onClick={closeSheet} className="block w-full text-center text-[15px] text-faint py-2">
                    Mejor no
                  </button>
                </div>
              ) : avisar ? (
                /* Paso 2: avisarle al cliente. El cambio YA está en la base;
                   esto es lo que evita que se presente en el horario viejo. */
                <div className="py-2">
                  {avisar.tipo === "movido" && (
                    <p className="text-lg text-ink mb-1">
                      Quedó {cuando(avisar.date)} a las <span className="font-bold">{avisar.time}</span>.
                    </p>
                  )}
                  <p className="text-[15px] text-muted mb-3">
                    {avisar.mail === "enviado"
                      ? `Le mandamos el mail con el horario nuevo. Igual conviene el WhatsApp: se lee mucho antes.`
                      : `${avisar.clientName.trim().split(/\s+/)[0]} todavía no lo sabe.${
                          avisar.tipo === "movido" ? " Avisale así no viene al horario viejo." : " Avisale así no viene al pedo."
                        }`}
                  </p>

                  {/* Estado del mail automático. Se muestra siempre que haya
                      salido el intento: que el dueño sepa si el cliente ya se
                      enteró por otro lado o si sigue dependiendo de él. */}
                  {avisar.mail && (
                    <p className="text-[14px] mb-5">
                      {avisar.mail === "enviando" ? (
                        <span className="text-faint">Mandándole el mail…</span>
                      ) : avisar.mail === "enviado" ? (
                        <span className="text-accent-ink font-semibold">✓ Mail enviado</span>
                      ) : avisar.mail === "sin-email" ? (
                        <span className="text-faint">No dejó email al reservar: por mail no se entera.</span>
                      ) : (
                        <span className="text-danger">No se pudo mandar el mail. Avisale por acá.</span>
                      )}
                    </p>
                  )}

                  <a href={waAviso(avisar)} target="_blank" rel="noopener noreferrer" onClick={closeSheet}
                    className="block w-full rounded-full bg-[#25D366] text-white font-bold py-3.5 text-center mb-3">
                    Avisarle por WhatsApp
                  </a>
                  <button onClick={closeSheet} className="block w-full text-center text-[15px] text-faint py-2">
                    Ya le avisé por otro lado
                  </button>
                </div>
              ) : !schedInfo ? (
                <p className="text-lg text-faint py-6 text-center">Cargando horarios…</p>
              ) : (
                <>
                  {/* día destino */}
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                    {days.map((d) => {
                      const ds = fmtDate(d); const on = moveDate === ds; const closed = moveDayBlocked(ds);
                      return (
                        <button key={ds} disabled={closed} onClick={() => { setMoveDate(ds); setMoveTime(null); }}
                          className={`shrink-0 w-12 rounded-2xl border-[1.5px] py-2 text-center transition-colors ${
                            closed ? "border-line bg-line opacity-45 cursor-not-allowed"
                              : on ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
                          <div className={`text-[11px] uppercase font-semibold ${on && !closed ? "text-accent-ink" : "text-faint"}`}>{ds === today ? "Hoy" : DAYS_ES[d.getDay()]}</div>
                          <div className={`text-lg font-bold ${on ? "text-accent-ink" : "text-ink"}`}>{d.getDate()}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* horarios libres */}
                  {moveSlots.grid.length === 0 ? (
                    <p className="text-lg text-faint py-4 text-center">
                      {moving?.staff_id && absences.has(`${moving.staff_id}|${moveDate}`)
                        ? `${staffName(moving.staff_id)} no está ese día. Elegí otro.`
                        : "Cerrado ese día. Elegí otro."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {moveSlots.grid.map((s) => {
                        const free = moveSlots.availability[s]; const on = moveTime === s;
                        return (
                          <button key={s} disabled={!free} onClick={() => setMoveTime(s)}
                            className={`rounded-xl border-[1.5px] py-2 text-[14px] font-bold transition-colors ${
                              !free ? "border-dashed border-line bg-transparent text-faint line-through"
                                : on ? "border-accent bg-accent text-on-accent"
                                : "border-line bg-surface text-body"}`}>{s}</button>
                        );
                      })}
                    </div>
                  )}

                  {moveError && <p className="text-lg text-danger mb-3 text-center">{moveError}</p>}

                  <motion.button whileTap={{ scale: 0.97 }} onClick={confirmMove} disabled={!moveTime || moveSaving}
                    className="w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity">
                    {moveSaving ? "Moviendo…" : moveTime ? `Mover a ${moveDate === today ? "hoy" : moveDate} · ${moveTime}` : "Elegí un horario"}
                  </motion.button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[13px] font-bold uppercase tracking-widest text-faint mb-2 ${className}`}>{children}</div>;
}
