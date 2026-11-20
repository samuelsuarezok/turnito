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
import SoporteWhatsApp from "@/components/SoporteWhatsApp";
import DiaBtn from "@/components/DiaBtn";
import {
  IcoCalendario, IcoCampana, IcoChart, IcoCheck, IcoCopy, IcoDescarga, IcoListo, IcoLogout,
  IcoMensaje, IcoPlus, IcoReloj, IcoSliders, IcoX,
} from "@/components/icons";
import * as ui from "@/lib/ui";
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
// Los 7 días de la tira, contados desde el día que se le pase y NO desde
// `new Date()`: así la tira depende del `today` que el panel tiene en estado, y
// se rearma sola cuando ese estado cambia al cruzar la medianoche.
function getNext7Days(desde: string) {
  const [y, m, d] = desde.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => new Date(y, m - 1, d + i));
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

// Lo mismo para "a": "a hoy", "a mañana", pero "AL sábado 21". Lo usa el botón
// de mover, que antes mostraba la fecha cruda ("Mover a 2026-11-21 · 11:00").
function aCuando(ds: string) {
  const c = cuando(ds);
  return c.startsWith("el ") ? `al ${c.slice(3)}` : `a ${c}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Título del día que se está mirando: "Hoy, viernes 20 de noviembre" o
// "Sábado 21 de noviembre". Antes los días que no eran hoy salían como
// "2026-11-21".
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function tituloDia(ds: string, hoy: string) {
  const [y, m, d] = ds.split("-").map(Number);
  const fecha = `${DIAS_LARGOS[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}`;
  return ds === hoy ? `Hoy, ${fecha}` : cap(fecha);
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
  // Falla al refrescar la lista del día. Aparte de `loadErr`: ese reemplaza la
  // pantalla entera, y hacer eso cada 5 segundos por un parpadeo de conexión
  // sería peor que el problema. Este avisa sin sacar de pantalla lo que ya está.
  const [apptsErr, setApptsErr] = useState("");

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

  // ── EL DÍA DE HOY ES ESTADO, NO UNA CONSTANTE ────────────────────────────
  //
  // El panel de un local vive abierto: en la tablet del mostrador, o en una
  // pestaña del teléfono que nadie cierra nunca. Antes `today` se leía del reloj
  // en cada render pero `date` y `days` quedaban clavados en el día en que se
  // había abierto la página. O sea que al cruzar la medianoche el panel seguía
  // pidiendo los turnos de AYER cada 5 segundos, para siempre, y los de hoy no
  // aparecían jamás. El dueño lo ve exactamente como "mis clientes reservaron
  // y a mí no me figuran".
  //
  // Ahora el cambio de día lo detecta el mismo tick del polling (más abajo) y
  // lo corrige. La tira de 7 días se rearma sola cuando `today` cambia.
  const [today, setToday] = useState(() => fmtDate(new Date()));
  const days = useMemo(() => getNext7Days(today), [today]);

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
    const { data, error } = await supabase
      .from("appointments")
      .select("id, client_name, client_phone, date, time, status, token, staff_id, price, service_name, services(name, duration_min)")
      .eq("business_id", shopId).eq("date", onDate).order("time");

    // El error se descartaba y se hacía `?? []`. Con eso CUALQUIER falla —un
    // GRANT que falta, PostgREST caído, el wifi del local— se veía idéntica a un
    // día sin turnos: "0 en cola", pantalla limpia, cero explicación. El dueño
    // no tiene manera de distinguir "no reservó nadie" de "no te lo pudimos
    // mostrar", y lo reporta como que sus clientes sacaron turno y no le figura.
    //
    // Tampoco pisamos la lista con [] : que quede lo último que sí cargó es más
    // útil que vaciar la pantalla por un corte de dos segundos.
    if (error) {
      console.error("loadAppts:", error.code, error.message);
      setApptsErr("No pudimos actualizar la lista. Puede haber turnos que no estás viendo.");
      return;
    }
    setApptsErr("");
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
    const tick = () => {
      // Cruce de medianoche. El panel puede llevar horas abierto, así que el
      // "hoy" con el que arrancó puede haber quedado viejo; si no se corrige,
      // el polling pide para siempre los turnos de un día que ya pasó.
      const ahora = fmtDate(new Date());
      if (ahora !== today) {
        setToday(ahora);
        // Sólo lo movemos si estaba parado en "hoy". Si eligió mirar otro día
        // a propósito, cambiarle la vista de abajo de los pies es peor.
        if (date === today) setDate(ahora);
        // No hace falta cargar acá: cambiar `date` dispara el efecto de arriba,
        // y si no cambió, el loadAppts de la línea siguiente hace lo suyo.
      }
      loadAppts(shop.id, date);
    };
    const id = setInterval(tick, 5000); // cada 5s: se siente "vivo" y para un local sobra
    // Bonus: al volver a la pestaña, refresca al toque. Y como el tick también
    // mira la fecha, volver a la pestaña a la mañana siguiente ya trae el día
    // correcto en vez del de ayer.
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, date, today]);

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
          <p className="text-[18px] leading-6 font-semibold text-ink">No pudimos cargar tu panel</p>
          <p className="text-[15px] leading-6 text-muted mt-1 mb-6">Puede ser un problema de conexión. Probá de nuevo.</p>
          <button onClick={() => window.location.reload()} className={btnPrimary + " px-6"}>
            Reintentar
          </button>
        </div>
      </main>
    );

  if (!shop)
    return (
      <main className="min-h-screen bg-canvas p-4 sm:p-6 lg:p-8">
        <div className="max-w-md lg:max-w-6xl mx-auto pb-16 animate-pulse">
          <div className="flex items-center justify-between mb-8">
            <div className="h-7 w-48 rounded-lg bg-surface" />
            <div className="h-9 w-32 rounded-lg bg-surface" />
          </div>
          <div className="flex gap-2 mb-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-14 h-16 rounded-xl bg-surface" />)}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-surface" />)}
          </div>
          <div className="h-56 rounded-3xl bg-surface mb-4 lg:max-w-[400px]" />
        </div>
      </main>
    );

  // Botones sueltos: en mobile ocupan el ancho; en monitor, si no hay segunda
  // columna, se limitan (un botón de 1400px no es una acción, es una pared).
  const anchoSuelto = hayCola ? "w-full" : "w-full lg:max-w-sm";

  return (
    <main className="min-h-screen bg-canvas text-body p-4 sm:p-6 lg:p-8">
      <div className="max-w-md lg:max-w-6xl mx-auto pb-16">
        {/* header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <LogoMark size={24} />
            <h1 className="text-[20px] leading-7 font-semibold text-ink truncate">{shop.name}</h1>
          </div>

          {/* En el celular quedan sólo los íconos: con texto, el nombre del
              local se partía en dos renglones y la barra se amontonaba. */}
          <nav className="flex items-center gap-1 shrink-0">
            <ThemeToggle className="mr-1" />
            <Link href="/panel/stats" aria-label="Números" className={navLink}>
              <IcoChart /><span className="hidden sm:inline">Números</span>
            </Link>
            <Link href="/panel/config" aria-label="Configuración" className={navLink}>
              <IcoSliders /><span className="hidden sm:inline">Config</span>
            </Link>
            <button aria-label="Salir" className={navLink}
              onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}>
              <IcoLogout /><span className="hidden sm:inline">Salir</span>
            </button>
          </nav>
        </header>

        {/* El link va debajo y a lo ancho: al lado de la barra, en el celular,
            se partía en dos renglones ("el-/toro"). */}
        <div className="mt-1 mb-8">
          <button onClick={copyLink}
            className="inline-flex items-center gap-2 text-[13px] leading-5 text-muted hover:text-ink transition-colors">
            <span className="font-mono whitespace-nowrap">{SITE_DOMAIN}/{shop.slug}</span>
            <span className={`inline-flex items-center gap-1 ${copied ? "text-accent-ink font-medium" : ""}`}>
              {copied ? <IcoCheck size={14} /> : <IcoCopy size={14} />}
              {copied ? "Copiado" : "Copiar"}
            </span>
          </button>

          {/* El link se fija al crear la cuenta y no sigue al nombre: ya está en
              la bio de Instagram, en estados de WhatsApp y en el historial de los
              clientes, y cambiarlo los rompería a todos sin aviso.
              La aclaración aparece SÓLO cuando dejaron de coincidir. Si el local
              se sigue llamando igual que su link, no hay nada que explicar y una
              línea fija ahí sería ruido permanente. */}
          {slugify(shop.name) !== shop.slug && (
            <p className="text-[13px] leading-5 text-muted mt-2 max-w-sm">
              Tu link quedó fijo desde que creaste la cuenta y no cambia con el nombre,
              para no romper el que ya compartiste con tus clientes.
            </p>
          )}
        </div>

        {/* días */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {days.map((d) => {
            const ds = fmtDate(d);
            return (
              <DiaBtn key={ds} fecha={d} label={ds === today ? "Hoy" : DAYS_ES[d.getDay()]}
                on={date === ds} onClick={() => setDate(ds)} />
            );
          })}
        </div>

        {/* filtro por persona (sólo si el local cargó equipo) */}
        {staff.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            <button onClick={() => setStaffFilter(null)} aria-pressed={staffFilter === null}
              className={chip(staffFilter === null)}>
              Todos
            </button>
            {staff.map((b) => {
              const off = absences.has(`${b.id}|${date}`);
              return (
                <button key={b.id} onClick={() => setStaffFilter(b.id)} aria-pressed={staffFilter === b.id}
                  className={chip(staffFilter === b.id)}>
                  {b.name}{off && <span className="opacity-60"> · libre</span>}
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
            tranquilo.

            Sin cola el contenido ocupa EL ANCHO COMPLETO, no una columna.
            Dos intentos fallidos antes de este: centrado quedaba despegado del
            encabezado, y encajonado en 400px dejaba el 70% del monitor vacío —
            un dashboard que no usa la pantalla. Ahora la tarjeta del estado
            vacío se estira y lee como un panel tranquilo, que es lo que es.
            Los botones sueltos sí se limitan (lg:max-w-sm): un botón de 1400px
            de ancho no es una acción, es una pared. */}
        {/* ── TÍTULO DEL DÍA + NÚMEROS ─────────────────────────────────
            Van A LO ANCHO y fuera del grid, que es como se ordena un
            dashboard: los números primero y abarcando la pantalla, el
            detalle debajo. ── */}
        <h2 className="text-[18px] leading-6 font-semibold text-ink mt-4 mb-3">{tituloDia(date, today)}</h2>

        {/* Números del día. El de la izquierda es el que importa: se mueve en el
            momento en que marcás un turno como atendido. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
          <Stat label="Cobrado" sub={plural(done.length, "atendido", "atendidos")}>
            <motion.span key={resumen.cobrado} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.3, ease: EASE }}>
              {fmtPesos(resumen.cobrado)}
            </motion.span>
          </Stat>
          <Stat label="Por cobrar" sub={`${active.length} en cola`}>
            {fmtPesos(resumen.porCobrar)}
          </Stat>
          <Stat label="Ausencias" sub={resumen.ausencias === 1 ? "no vino" : "no vinieron"}
            alerta={resumen.ausencias > 0}>
            {resumen.ausencias}
          </Stat>
        </div>

        {resumen.sinPrecio > 0 && (
          <p className="text-[13px] leading-5 text-muted -mt-3 mb-6">
            {resumen.sinPrecio === 1 ? "Hay 1 turno atendido sin" : `Hay ${resumen.sinPrecio} turnos atendidos sin`}{" "}
            precio guardado, así que el total les queda corto.
          </p>
        )}

        <div className={hayCola
          ? "lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-8 lg:items-start"
          : ""}>
        <div className={hayCola ? "lg:sticky lg:top-6" : ""}>

        {apptsErr && (
          <p role="alert" className="rounded-xl bg-danger-soft text-danger text-[14px] leading-5 px-4 py-3 mb-4">
            {apptsErr}
          </p>
        )}

        {/* Filtrando por una persona con la agenda vacía, el día se ve igual que
            un día sin turnos. Decirlo evita el "mis clientes reservaron y no me
            figuran" cuando en realidad están, pero con otro del equipo. */}
        {staffFilter && appts.length > shownAppts.length && (
          <p className="text-[14px] leading-5 text-muted mb-4">
            Estás viendo sólo los de <span className="font-medium text-ink">{staffName(staffFilter)}</span>. Hay{" "}
            {appts.length - shownAppts.length} turno{appts.length - shownAppts.length === 1 ? "" : "s"} más
            {" "}este día con otras personas —{" "}
            <button onClick={() => setStaffFilter(null)} className="text-accent-ink font-medium underline underline-offset-2">
              ver todos
            </button>
            .
          </p>
        )}

        <button onClick={abrirNuevo}
          className={`${anchoSuelto} inline-flex items-center justify-center gap-2 h-12 rounded-2xl border border-dashed border-line text-[15px] font-semibold text-accent-ink mb-4 transition-[background-color,border-color,transform] duration-150 hover:border-accent hover:bg-accent-soft active:scale-[0.98]`}>
          <IcoPlus /> Cargar un turno
        </button>

        {/* SIGUIENTE — el lima marca esto y nada más: el turno que viene. */}
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div key={current.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="rounded-3xl bg-highlight text-on-highlight p-5 sm:p-6 mb-4">
              <div className="flex items-center justify-between gap-4 text-[13px] leading-5 font-semibold">
                <span>Siguiente</span>
                {staffName(current.staff_id) && (
                  <span className="font-medium opacity-60 truncate">con {staffName(current.staff_id)}</span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-3">
                <div className="text-[40px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                  {current.time.slice(0, 5)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[22px] leading-7 font-semibold truncate">{current.client_name}</div>
                  <div className="text-[15px] leading-5 opacity-70">
                    {current.services?.name} · {formatDuracion(current.services?.duration_min ?? 0)}
                  </div>
                </div>
              </div>
              {/* Teléfono → abre WhatsApp */}
              <a href={waLink(current.client_phone)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-[15px] leading-5 font-medium underline underline-offset-2 decoration-on-highlight/30 hover:decoration-on-highlight">
                <IcoMensaje /> {current.client_phone}
              </a>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStatus(current.id, "done")}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-full bg-on-highlight text-highlight text-[16px] font-semibold transition-transform duration-150 active:scale-[0.98]">
                  <IcoCheck /> Listo, siguiente
                </button>
                <button onClick={() => setStatus(current.id, "no_show")}
                  className="h-12 px-5 rounded-full border border-on-highlight/25 text-[15px] font-semibold transition-[background-color,transform] duration-150 hover:bg-on-highlight/5 active:scale-[0.98]">
                  No vino
                </button>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-on-highlight/10">
                <a href={waRecordatorio(current)} target="_blank" rel="noopener noreferrer" className={accionLima}>
                  <IcoCampana /> Recordarle
                </a>
                <button onClick={() => openMove(current)} className={accionLima}>
                  <IcoReloj /> Mover de horario
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="rounded-3xl border border-line bg-surface p-8 text-center mb-4">
              {shownAppts.length === 0 ? (
                <>
                  <IcoCalendario className="mx-auto mb-4 text-muted" />
                  <p className="text-[18px] leading-6 font-semibold text-ink">Todavía no hay turnos este día</p>
                  <p className="text-[15px] leading-6 text-muted mt-1 mb-6">Compartí tu link para recibir el primero</p>
                  <button onClick={copyLink} className={btnPrimary + " px-6"}>
                    {copied ? <><IcoCheck /> Link copiado</> : "Copiar mi link"}
                  </button>
                </>
              ) : (
                <>
                  <IcoListo className="mx-auto mb-4 text-accent-ink" />
                  <p className="text-[18px] leading-6 font-semibold text-ink">Día completado</p>
                  <p className="text-[15px] leading-6 text-muted mt-1">Atendiste todos los turnos. Bien ahí.</p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Descarga: acción de una vez por mes. Va al pie y sin borde para que no
            le compita a la tarjeta del turno que viene, que se mira todo el día. */}
        <button onClick={bajarUltimos30} disabled={bajando}
          className={`${anchoSuelto} inline-flex items-center justify-center gap-2 h-10 rounded-xl text-[14px] font-medium text-muted mb-6 transition-colors hover:text-ink hover:bg-surface disabled:opacity-50`}>
          {bajando ? "Preparando…" : <><IcoDescarga /> Descargar los últimos 30 días</>}
        </button>

        </div>{/* fin columna izquierda */}
        <div>

        {/* SIGUEN DESPUÉS */}
        {rest.length > 0 && (
          <>
            <SectionLabel>Después siguen</SectionLabel>
            <div className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {rest.map((a) => (
                  <motion.div key={a.id} layout
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE }}
                    className="flex items-center gap-3 sm:gap-4 rounded-2xl bg-surface border border-line pl-4 pr-2 py-3">
                    <div className="w-12 shrink-0 text-[17px] leading-6 font-semibold tabular-nums text-ink">
                      {a.time.slice(0, 5)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[16px] leading-6 font-semibold text-ink truncate">{a.client_name}</div>
                      <div className="text-[13px] leading-5 text-muted">
                        {a.services?.name}
                        {staffName(a.staff_id) ? ` · ${staffName(a.staff_id)}` : ""} ·{" "}
                        <a href={waLink(a.client_phone)} target="_blank" rel="noopener noreferrer"
                          className="whitespace-nowrap underline-offset-2 hover:text-ink hover:underline">
                          {a.client_phone}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center shrink-0">
                      <a href={waRecordatorio(a)} target="_blank" rel="noopener noreferrer"
                        className={iconBtn} title="Recordarle el turno" aria-label={`Recordarle el turno a ${a.client_name}`}>
                        <IcoCampana />
                      </a>
                      <button onClick={() => openMove(a)} className={iconBtn}
                        title="Mover turno" aria-label={`Mover el turno de ${a.client_name}`}>
                        <IcoReloj />
                      </button>
                      <button onClick={() => setCancelando(a)} className={`${iconBtn} hover:text-danger`}
                        title="Cancelar turno" aria-label={`Cancelar el turno de ${a.client_name}`}>
                        <IcoX />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* YA ATENDIDOS */}
        {done.length > 0 && (
          <>
            <SectionLabel className="mt-8">Ya atendidos</SectionLabel>
            {done.map((a) => (
              <motion.div key={a.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-3 px-4 h-10 text-muted">
                <IcoCheck />
                <span className="w-12 shrink-0 text-[14px] tabular-nums">{a.time.slice(0, 5)}</span>
                <span className="text-[15px] line-through decoration-faint truncate">{a.client_name}</span>
              </motion.div>
            ))}
          </>
        )}

        </div>{/* fin columna derecha */}
        </div>{/* fin grid */}

        {/* Soporte. Dos variantes porque son dos lugares distintos, no el mismo
            botón movido: en el celular va acá abajo, después de los turnos (un
            flotante taparía justo lo que el dueño vino a mirar), y en monitor
            queda anclado al costado, siempre a mano mientras trabaja.
            La variante `side` sale por un portal — ver el header del componente. */}
        <SoporteWhatsApp variant="bottom" negocio={shop.name} />
        <SoporteWhatsApp variant="side" negocio={shop.name} />
      </div>

      {/* MODAL CARGAR TURNO A MANO */}
      <AnimatePresence>
        {nuevo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setNuevo(false)}
            className="fixed inset-0 z-50 bg-black/45 flex items-end lg:items-center justify-center">
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ duration: 0.35, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface rounded-t-3xl lg:rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[20px] leading-7 font-semibold text-ink">Cargar un turno</h2>
                <button onClick={() => setNuevo(false)} className={iconBtn} aria-label="Cerrar"><IcoX /></button>
              </div>
              <p className="text-[14px] leading-5 text-muted mb-6">
                Para lo que se cerró por teléfono, al mostrador o por WhatsApp. Queda igual
                que un turno reservado por la web y suma en los números del día.
              </p>

              <SectionLabel>Servicio</SectionLabel>
              <div className="grid grid-cols-3 gap-2 mb-6">
                {services.map((s) => (
                  <button key={s.id}
                    onClick={() => { setNvSvc(s); setNvHora(null); setNvStaff(null); }}
                    aria-pressed={nvSvc?.id === s.id}
                    className={opcion(nvSvc?.id === s.id)}>
                    <div className="text-[14px] leading-5 font-semibold text-ink truncate">{s.name}</div>
                    <div className="text-[13px] leading-5 text-muted">{formatDuracion(s.duration_min)}</div>
                  </button>
                ))}
              </div>

              {nvSvc && nvElegibles.length > 0 && (
                <>
                  <SectionLabel>Quién atiende</SectionLabel>
                  <div className="grid grid-cols-3 gap-2 mb-6">
                    {nvElegibles.map((b) => (
                      <button key={b.id} onClick={() => { setNvStaff(b.id); setNvHora(null); }}
                        aria-pressed={nvStaff === b.id}
                        className={opcion(nvStaff === b.id)}>
                        <div className="text-[14px] leading-5 font-semibold text-ink truncate">{b.name}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <SectionLabel>Día</SectionLabel>
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                {days.map((d) => {
                  const ds = fmtDate(d);
                  return (
                    <DiaBtn key={ds} fecha={d} label={ds === today ? "Hoy" : DAYS_ES[d.getDay()]}
                      on={nvFecha === ds} onClick={() => { setNvFecha(ds); setNvHora(null); }} />
                  );
                })}
              </div>

              <SectionLabel>Horario</SectionLabel>
              {!nvSvc ? (
                <p className="text-[14px] leading-5 text-muted mb-6">Elegí primero el servicio</p>
              ) : nvElegibles.length > 0 && !nvStaff ? (
                <p className="text-[14px] leading-5 text-muted mb-6">Elegí quién lo atiende para ver sus horarios</p>
              ) : nvSlots.grid.length === 0 ? (
                <p className="text-[14px] leading-5 text-muted mb-6">No hay horarios ese día. Probá con otro.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 mb-6">
                  {nvSlots.grid.map((s) => (
                    <button key={s} disabled={!nvSlots.availability[s]} onClick={() => setNvHora(s)}
                      className={horario(nvSlots.availability[s], nvHora === s)}>{s}</button>
                  ))}
                </div>
              )}

              <SectionLabel>Cliente</SectionLabel>
              <input value={nvNombre} onChange={(e) => setNvNombre(e.target.value)} placeholder="Nombre y apellido"
                autoComplete="off" aria-label="Nombre y apellido del cliente" className={`${inputCls} mb-2`} />
              <input value={nvTel} onChange={(e) => setNvTel(e.target.value)} placeholder="351 234-5678"
                type="tel" inputMode="tel" autoComplete="off" aria-label="Teléfono del cliente" className={`${inputCls} mb-6`} />

              {nvError && <p role="alert" className={errorBox}>{nvError}</p>}

              <button onClick={guardarNuevo} disabled={!nvHora || nvSaving} className={`${btnPrimary} w-full`}>
                {nvSaving ? "Guardando…" : "Guardar turno"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SHEET: mover · cancelar · avisar. Uno solo para los tres pasos, así el
          aviso al cliente se ve igual venga de donde venga. */}
      <AnimatePresence>
        {(moving || cancelando || avisar) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeMove}
            className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center">
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ duration: 0.35, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[20px] leading-7 font-semibold text-ink">
                  {avisar ? (avisar.tipo === "movido" ? "Turno movido" : "Turno cancelado")
                    : cancelando ? "¿Cancelar el turno?" : "Mover turno"}
                </h2>
                <button onClick={closeSheet} className={iconBtn} aria-label="Cerrar"><IcoX /></button>
              </div>
              <p className="text-[15px] leading-6 text-muted mb-6">
                {(() => {
                  const a = moving ?? cancelando;
                  if (a) return `${a.client_name} · ${a.services?.name} (${formatDuracion(a.services?.duration_min ?? 0)})${staffName(a.staff_id) ? ` · con ${staffName(a.staff_id)}` : ""}`;
                  return `${avisar?.clientName} · ${avisar?.serviceName}`;
                })()}
              </p>

              {cancelando ? (
                /* Paso 1 del cancelar: confirmar. El ✕ cancelaba de una. */
                <div>
                  <p className="text-[18px] leading-6 text-ink mb-1">
                    {cap(cuando(cancelando.date))} a las <span className="font-semibold tabular-nums">{cancelando.time.slice(0, 5)}</span>
                  </p>
                  <p className="text-[15px] leading-6 text-muted mb-6">
                    El horario queda libre y se lo vas a poder avisar al cliente en el paso siguiente.
                  </p>
                  {/* text-surface y no text-white: en modo noche el rojo es claro
                      y el blanco encima no se leía. */}
                  <button onClick={confirmCancel} disabled={cancelSaving}
                    className="w-full h-12 rounded-full bg-danger text-surface text-[16px] font-semibold transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-40 mb-2">
                    {cancelSaving ? "Cancelando…" : "Sí, cancelar el turno"}
                  </button>
                  <button onClick={closeSheet} className={btnTexto}>
                    Mejor no
                  </button>
                </div>
              ) : avisar ? (
                /* Paso 2: avisarle al cliente. El cambio YA está en la base;
                   esto es lo que evita que se presente en el horario viejo. */
                <div>
                  {avisar.tipo === "movido" && (
                    <p className="text-[18px] leading-6 text-ink mb-1">
                      Quedó {cuando(avisar.date)} a las <span className="font-semibold tabular-nums">{avisar.time}</span>.
                    </p>
                  )}
                  <p className="text-[15px] leading-6 text-muted mb-4">
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
                    <p className="text-[14px] leading-5 mb-6">
                      {avisar.mail === "enviando" ? (
                        <span className="text-muted">Mandándole el mail…</span>
                      ) : avisar.mail === "enviado" ? (
                        <span className="inline-flex items-center gap-1.5 text-accent-ink font-medium"><IcoCheck size={14} /> Mail enviado</span>
                      ) : avisar.mail === "sin-email" ? (
                        <span className="text-muted">No dejó email al reservar: por mail no se entera.</span>
                      ) : (
                        <span className="text-danger">No se pudo mandar el mail. Avisale por acá.</span>
                      )}
                    </p>
                  )}

                  {/* Verde de WhatsApp con texto oscuro: con blanco encima daba
                      2:1 de contraste y no pasaba ni el mínimo. */}
                  <a href={waAviso(avisar)} target="_blank" rel="noopener noreferrer" onClick={closeSheet}
                    className="flex items-center justify-center w-full h-12 rounded-full bg-[#25D366] text-[#0b141a] text-[16px] font-semibold mb-2 transition-transform duration-150 active:scale-[0.98]">
                    Avisarle por WhatsApp
                  </a>
                  <button onClick={closeSheet} className={btnTexto}>
                    Ya le avisé por otro lado
                  </button>
                </div>
              ) : !schedInfo ? (
                <p className="text-[15px] leading-6 text-muted py-6 text-center">Cargando horarios…</p>
              ) : (
                <>
                  {/* día destino */}
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                    {days.map((d) => {
                      const ds = fmtDate(d);
                      return (
                        <DiaBtn key={ds} fecha={d} label={ds === today ? "Hoy" : DAYS_ES[d.getDay()]}
                          on={moveDate === ds} disabled={moveDayBlocked(ds)}
                          onClick={() => { setMoveDate(ds); setMoveTime(null); }} />
                      );
                    })}
                  </div>

                  {/* horarios libres */}
                  {moveSlots.grid.length === 0 ? (
                    <p className="text-[15px] leading-6 text-muted py-4 text-center">
                      {moving?.staff_id && absences.has(`${moving.staff_id}|${moveDate}`)
                        ? `${staffName(moving.staff_id)} no está ese día. Elegí otro.`
                        : "Cerrado ese día. Elegí otro."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mb-6">
                      {moveSlots.grid.map((s) => (
                        <button key={s} disabled={!moveSlots.availability[s]} onClick={() => setMoveTime(s)}
                          className={horario(moveSlots.availability[s], moveTime === s)}>{s}</button>
                      ))}
                    </div>
                  )}

                  {moveError && <p role="alert" className={errorBox}>{moveError}</p>}

                  <button onClick={confirmMove} disabled={!moveTime || moveSaving} className={`${btnPrimary} w-full`}>
                    {moveSaving ? "Moviendo…" : moveTime ? `Mover ${aCuando(moveDate)} · ${moveTime}` : "Elegí un horario"}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// ── PIEZAS DE UI ─────────────────────────────────────────────────────────
// Las clases comunes (botones, inputs, chips, horarios) viven en lib/ui.ts y
// las comparten todas las pantallas. Acá quedan sólo las propias del panel.

const { btnPrimary, btnTexto, navLink, iconBtn, chip, opcion, horario } = ui;
const inputCls = ui.input({ bg: "bg-canvas" });
const errorBox = `${ui.errorBox} mb-4`;
const accionLima =
  "flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-full text-[14px] font-medium opacity-75 " +
  "transition-[opacity,background-color] duration-150 hover:opacity-100 hover:bg-on-highlight/5";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Stat({ label, sub, alerta = false, children }: {
  label: string; sub: string; alerta?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-3 sm:p-4">
      <div className="text-[13px] leading-5 text-muted">{label}</div>
      <div className={`text-[22px] sm:text-[28px] leading-none font-semibold tabular-nums mt-2 ${alerta ? "text-danger" : "text-ink"}`}>
        {children}
      </div>
      <div className="text-[13px] leading-5 text-muted mt-2">{sub}</div>
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`${ui.sectionLabel} ${className}`}>{children}</div>;
}
