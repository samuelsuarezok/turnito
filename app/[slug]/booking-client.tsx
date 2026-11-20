"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { computeSlots, normalizeClosed, fullDayClosedSet, normalizeAusencias, ausenciasDeDiaCompleto, toMin, type ClosedEntry, type OpeningRange, type Ausencia } from "@/lib/slots";
import { EQUIPO, formatPrecio, formatDuracion } from "@/lib/rubros";
import { SITE_DOMAIN } from "@/lib/site";
import { waLink } from "@/lib/contacto";
import ThemeToggle from "@/components/ThemeToggle";
import DiaBtn from "@/components/DiaBtn";
import { IcoAtras, IcoCheck, IcoMail, IcoMensaje, IcoX } from "@/components/icons";
import * as ui from "@/lib/ui";
import { cap, diaRelativo } from "@/lib/fechas";

// `staff_ids`: quiénes hacen este servicio. Vacío (o ausente, si todavía no se
// corrió 0009) = lo hace todo el equipo. Ver 0009_servicios_por_persona.sql.
type Service = {
  id: string; name: string; icon: string; duration_min: number; price: number;
  staff_ids?: string[];
  /** "consulta" = no se reserva online; se manda al WhatsApp de quien lo hace. */
  booking_mode?: "agenda" | "consulta";
};
// staff_id null = turno viejo / negocio de una sola agenda → ocupa a todos.
type BusySlot = { time: string; duration_min: number; staff_id: string | null };
// Cuándo NO está esa persona.
//   `absences`  — formato viejo: sólo los días completos (YYYY-MM-DD).
//   `ausencias` — desde la 0014: cada ausencia con su franja. from_time null
//                 sigue queriendo decir día completo.
// Se leen las dos porque public_shop_staff devuelve ambas: así la migración se
// pudo aplicar sin tener que coordinarla con el deploy.
type StaffMember = {
  id: string; name: string;
  absences: string[];
  ausencias?: Ausencia[];
  whatsapp?: string | null;
};
type ShopInfo = {
  name: string; slug: string; slot_minutes: number; min_notice_min: number;
  whatsapp?: string;
  services: Service[]; hours: OpeningRange[]; closed: ClosedEntry[];
};

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const EASE = [0.22, 1, 0.36, 1] as const;

// Confirmación por mail: apagada hasta tener dominio propio. Ver el checklist
// para prenderla en lib/email.ts. Mientras esté apagada el campo no se muestra
// y no se manda `client_email`.
const EMAIL_ENABLED = process.env.NEXT_PUBLIC_EMAIL_ENABLED === "1";

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getNext7Days() {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
}

// Los pasos se deslizan apenas (16px) en la dirección en que se avanza: alcanza
// para que se entienda "adelante" y "atrás" sin que la pantalla se sacuda.
const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 16 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -16, transition: { duration: 0.2, ease: EASE } }),
};

// El slug llega ya resuelto desde page.tsx, que ahora es un componente de
// servidor: es el que puede exportar generateMetadata y darle a cada negocio su
// propia vista previa al compartir el link.
export default function BookingClient({ slug }: { slug: string }) {
  const supabase = createClient();

  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [step, setStepRaw] = useState(1);
  const [dir, setDir] = useState(1);
  function goTo(n: number) { setDir(n > step ? 1 : -1); setStepRaw(n); }

  const [service, setService] = useState<Service | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  // Lo que el usuario tocó. La persona que vale es `member`, más abajo: puede
  // no coincidir con esto si el servicio elegido cambió las reglas.
  const [memberSel, setMember] = useState<StaffMember | null>(null);
  const [date, setDate] = useState(fmtDate(new Date()));
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusySlot[]>([]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(""); // opcional
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Errores por campo del paso 2. Antes el botón se apagaba en silencio
  // (CP-10): ahora se valida al enviar y se avisa junto al campo que falta.
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});
  const [token, setToken] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  // Honeypot. Va por ref y NO por useState a propósito: un bot que escribe
  // input.value directo en el DOM no dispara el onChange de React, así que con
  // un input controlado el estado quedaría vacío y la trampa nunca saltaría.
  // Leyendo el ref vemos el valor real del DOM, lo haya puesto quien lo haya puesto.
  const honeypotRef = useRef<HTMLInputElement>(null);

  const days = useMemo(() => getNext7Days(), []);
  const today = fmtDate(new Date());

  useEffect(() => {
    supabase.rpc("public_shop_info", { shop_slug: slug }).then(({ data, error }) => {
      if (error || !data) {
        // Antes de dar por perdido el link, puede ser una dirección vieja: el
        // local cambió su slug y este es el que sigue circulando en la bio de
        // Instagram o en un estado de WhatsApp. Ver 0012_cambiar_slug.sql.
        //
        // Es un redirect del lado del cliente y no un 301: la página es
        // "use client", y estas URLs se comparten entre personas, no se
        // posicionan en Google. Para el cliente que entra el efecto es el mismo.
        supabase.rpc("public_slug_actual", { viejo: slug }).then(({ data: actual }) => {
          if (actual) window.location.replace(`/${actual}`);
          else setNotFound(true);
        });
        return;
      }
      else setShop(data as ShopInfo);
    });
    // Equipo: si el negocio no cargó a nadie, es de una sola agenda y todo
    // funciona como siempre (no se muestra el selector).
    supabase.rpc("public_shop_staff", { shop_slug: slug }).then(({ data }) => {
      setStaff((data ?? []) as StaffMember[]);
      // La autoselección cuando queda una sola persona la resuelve el efecto de
      // más abajo, que además reacciona al servicio elegido.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!shop) return;
    loadBusy(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, date]);

  // v2 trae staff_id. Si todavía no existe (migración sin correr), caemos a la
  // vieja: sin staff_id todo ocupa a todos, que es el comportamiento de siempre.
  async function loadBusy(onDate: string) {
    const { data, error } = await supabase.rpc("public_busy_slots_v3", { shop_slug: slug, on_date: onDate });
    if (!error) return setBusy((data ?? []) as BusySlot[]);
    const { data: legacy } = await supabase.rpc("public_busy_slots", { shop_slug: slug, on_date: onDate });
    setBusy(((legacy ?? []) as Omit<BusySlot, "staff_id">[]).map((b) => ({ ...b, staff_id: null })));
  }

  const weekday = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }, [date]);

  // Bloqueos normalizados + set de días completos (lógica en lib/slots).
  const closedBlocks = useMemo(() => normalizeClosed(shop?.closed), [shop]);
  const fullDayClosed = useMemo(() => fullDayClosedSet(closedBlocks), [closedBlocks]);
  const dayIsClosed = fullDayClosed.has(date);

  const hasStaff = staff.length > 0;

  // Quiénes pueden atender el servicio elegido. Un servicio sin `staff_ids` lo
  // hace todo el equipo: es la regla de 0009 y también el caso de los negocios
  // que nunca tocaron la asignación. Sin servicio elegido todavía, mostramos a
  // todos para que se vea el equipo completo.
  const elegibles = useMemo(() => {
    const ids = service?.staff_ids;
    if (!ids || ids.length === 0) return staff;
    return staff.filter((s) => ids.includes(s.id));
  }, [staff, service]);

  // La persona que realmente vale. Es DERIVADA, no un estado que sincronizamos:
  // si elegiste un barbero para "Corte" y después cambiás a "Tatuaje", ese
  // barbero deja de valer solo, sin efectos ni renders intermedios. Y si sólo
  // queda una persona posible, se da por elegida y ni se le pregunta.
  //
  // El horario se limpia solo: `availability` depende de `member`, y más abajo
  // hay un ajuste durante el render que descarta el horario que ya no entra.
  const member = useMemo(() => {
    if (elegibles.length === 1) return elegibles[0];
    if (memberSel && elegibles.some((s) => s.id === memberSel.id)) return memberSel;
    return null;
  }, [elegibles, memberSel]);

  // Servicios que se conversan en vez de agendarse: un tatuaje se charla antes
  // (diseño, tamaño, cuántas sesiones), así que acá no hay calendario.
  const esConsulta = service?.booking_mode === "consulta";

  // A qué WhatsApp mandarlo: al de la persona si lo cargó, si no al del negocio.
  const waConsulta = useMemo(() => {
    if (!esConsulta || !shop) return null;
    const numero = member?.whatsapp?.trim() || shop.whatsapp?.trim();
    if (!numero) return null;
    const conQuien = member ? ` con ${member.name}` : "";
    return waLink(
      numero,
      `¡Hola! Te escribo desde ${SITE_DOMAIN}/${shop.slug}. Quería consultar por ${service!.name}${conQuien}.`
    );
  }, [esConsulta, shop, member, service]);

  // Las ausencias de la persona elegida, ya normalizadas.
  const ausenciasMember = useMemo(
    () => normalizeAusencias(member?.ausencias ?? member?.absences),
    [member]
  );

  /**
   * Cómo está una persona un día dado: `"completo"` (no viene), `"parcial"`
   * (no está algunas horas) o `null` (disponible). Sirve para los dos lugares
   * donde hay que avisarlo: la tarjeta de cada persona y el selector de días.
   */
  const estadoAusencia = (b: StaffMember, ds: string): "completo" | "parcial" | null => {
    const aus = normalizeAusencias(b.ausencias ?? b.absences);
    if (ausenciasDeDiaCompleto(aus).has(ds)) return "completo";
    return aus.some((a) => a.date === ds && a.from_time) ? "parcial" : null;
  };

  // Sólo cierra el día si la persona no está NINGUNA hora. Una ausencia de
  // 14 a 17 ya no tacha el día entero: tacha esas horas, y el resto sigue
  // disponible. Ése era el bug que reportó el local.
  const staffAbsent = useMemo(
    () => ausenciasDeDiaCompleto(ausenciasMember).has(date),
    [ausenciasMember, date]
  );

  // Las ausencias parciales entran como bloqueos más: mismo formato, mismo
  // camino. Lo único que cambia es el alcance — éstas son de esta persona.
  const bloqueosDelDia = useMemo(
    () => [...closedBlocks, ...ausenciasMember.filter((a) => a.from_time)],
    [closedBlocks, ausenciasMember]
  );

  // Intervalos ocupados en minutos: [inicio, fin)
  // Con varias agendas, cada una tiene la suya: sólo la ocupan sus propios
  // turnos (más los de staff_id null, de cuando había una sola).
  const busyIntervals = useMemo(
    () =>
      busy
        .filter((b) => !hasStaff || !member || b.staff_id === null || b.staff_id === member.id)
        .map((b) => { const s = toMin(b.time); return [s, s + b.duration_min] as [number, number]; }),
    [busy, hasStaff, member]
  );

  // Grilla + disponibilidad según la DURACIÓN del servicio elegido.
  // Lógica unificada en lib/slots (la misma que usa el panel para reprogramar).
  const { grid, availability } = useMemo(() => {
    if (!shop || dayIsClosed || staffAbsent) return { grid: [] as string[], availability: {} as Record<string, boolean> };
    // Solo hoy: no ofrecer horarios antes de ahora + anticipación mínima.
    let minStartMin: number | undefined;
    if (date === today) {
      const now = new Date();
      minStartMin = now.getHours() * 60 + now.getMinutes() + shop.min_notice_min;
    }
    return computeSlots({
      hours: shop.hours,
      weekday,
      date,
      slotMinutes: shop.slot_minutes,
      durationMin: service?.duration_min ?? shop.slot_minutes,
      closedBlocks: bloqueosDelDia,
      busyIntervals,
      minStartMin,
    });
  }, [shop, weekday, date, today, dayIsClosed, staffAbsent, busyIntervals, bloqueosDelDia, service]);

  // Si cambia el servicio/persona y el horario elegido ya no entra, deseleccionarlo.
  //
  // Se ajusta DURANTE EL RENDER, no en un useEffect. Es el patrón que React
  // documenta para "ajustar estado cuando cambia una prop"
  // (react.dev → You Might Not Need an Effect):
  //
  //   - Con effect: React pinta un frame con el horario inválido todavía
  //     seleccionado y recién después lo limpia. Se ve el parpadeo.
  //   - Durante el render: React descarta el render y vuelve a arrancar antes
  //     de tocar el DOM. El usuario nunca ve el estado intermedio.
  //
  // No hace loop: después del setTime(null), `time` es null y la condición da
  // false. Converge en un solo re-render.
  if (time && !availability[time]) setTime(null);

  async function book() {
    setError("");
    // Validación de lo evidente antes de pegarle al API (las mismas reglas
    // viven del otro lado en lib/validate-booking.ts, con los mismos
    // mensajes): nombre de 3+ letras y WhatsApp de 8+ dígitos.
    const next: { name?: string; phone?: string } = {};
    if (!name.trim()) next.name = "Ingresá tu nombre";
    else if (name.trim().length < 3) next.name = "Tu nombre es muy corto";
    const digitos = phone.replace(/\D/g, "");
    if (!phone.trim()) next.phone = "Ingresá tu WhatsApp";
    else if (digitos.length < 8) next.phone = "Ese WhatsApp no parece válido";
    setFieldErrors(next);
    if (next.name || next.phone) return;
    setSaving(true);
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug, service_id: service!.id, staff_id: member?.id ?? null,
        date, time, client_name: name.trim(), client_phone: phone.trim(),
        client_email: EMAIL_ENABLED ? email.trim() || null : null,
        website: honeypotRef.current?.value ?? "",
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo reservar. Probá de nuevo.");
      if (json.code === "SLOT_TAKEN") {
        goTo(1); setTime(null);
        await loadBusy(date); // refrescar ocupados
      }
      return;
    }
    setToken(json.token);
    setEmailSent(!!json.emailSent);
    goTo(3);
  }

  if (notFound) return <Center><p className="text-[15px] text-muted">Este negocio no existe o no está disponible.</p></Center>;
  if (!shop)
    return (
      <main className="min-h-screen bg-canvas p-4 sm:p-6">
        <div className="max-w-md mx-auto pt-4 animate-pulse">
          <div className="h-7 w-48 rounded-lg bg-surface mb-2" />
          <div className="h-4 w-32 rounded bg-surface mb-8" />
          <div className="h-4 w-20 rounded bg-surface mb-3" />
          <div className="grid grid-cols-3 gap-2 mb-8">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-surface" />)}
          </div>
          <div className="h-4 w-12 rounded bg-surface mb-3" />
          <div className="flex gap-2 mb-8">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-14 h-16 rounded-xl bg-surface" />)}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-surface" />)}
          </div>
        </div>
      </main>
    );

  if (step === 3 && token)
    return (
      <Center>
        <motion.div className="w-full max-w-sm text-center"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
          {/* El lima marca lo reservado: es el mismo color de la tarjeta
              "Siguiente" que el local ve en su panel. */}
          <div className="w-16 h-16 rounded-full bg-highlight text-on-highlight flex items-center justify-center mx-auto mb-6">
            <IcoCheck size={28} />
          </div>
          <h1 className={`${ui.h1} mb-2`}>Turno confirmado</h1>
          <p className="text-[16px] leading-6 text-muted mb-8">
            {cap(diaRelativo(date))} a las <span className="text-ink font-medium tabular-nums">{time}</span> · {shop.name}
            {member ? ` · con ${member.name}` : ""}
          </p>
          <div className={`${ui.card} p-5 text-left mb-4`}>
            <p className="text-[15px] leading-6 text-muted mb-2">Guardá este link para ver o cancelar tu turno</p>
            <a href={`/t/${token}`} className="font-mono text-[14px] leading-5 text-accent-ink underline underline-offset-2 break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}/t/{token}
            </a>
          </div>
          {emailSent ? (
            <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-left flex gap-3">
              <IcoMail size={18} className="text-muted mt-0.5" />
              <div>
                <p className="text-[15px] leading-6 text-body">
                  Te mandamos la confirmación a <span className="font-medium text-ink">{email.trim()}</span>.
                </p>
                <p className="text-[14px] leading-5 text-muted mt-1">
                  Si no la ves en unos minutos, revisá la carpeta de spam o correo no deseado.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[14px] leading-5 text-muted">Es tu comprobante del turno.</p>
          )}
        </motion.div>
      </Center>
    );

  return (
    <main className="min-h-screen bg-canvas text-body p-4 sm:p-6 overflow-x-hidden">
      <div className="max-w-md mx-auto pt-4 pb-16">
        <header className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <h1 className="text-[22px] leading-7 font-semibold text-ink truncate">{shop.name}</h1>
            <p className="text-[13px] leading-5 text-muted font-mono mt-0.5">{SITE_DOMAIN}/{shop.slug}</p>
          </div>
          <ThemeToggle />
        </header>

        <AnimatePresence mode="wait" custom={dir}>
          {step === 1 && (
            <motion.div key="s1" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              {/* Error de reserva que vino del paso 2 (p.ej. SLOT_TAKEN): book()
                  vuelve al paso 1 para que elija otro horario, pero el mensaje
                  tiene que verse ACÁ o el cliente nunca se entera de qué pasó.
                  Se limpia solo al elegir otro día/horario/servicio/persona. */}
              {error && (
                <motion.div role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`${ui.errorBox} mb-6 flex items-start justify-between gap-3`}>
                  <p>{error}</p>
                  <button onClick={() => setError("")} aria-label="Cerrar aviso" className="shrink-0 -mr-1 -mt-0.5">
                    <IcoX size={16} />
                  </button>
                </motion.div>
              )}

              <div className={ui.sectionLabel}>Servicio</div>
              <div className="grid grid-cols-3 gap-2 mb-8">
                {shop.services.map((s) => (
                  <button key={s.id} onClick={() => { setService(s); setError(""); }}
                    aria-pressed={service?.id === s.id} className={ui.opcion(service?.id === s.id)}>
                    <div className="text-[15px] leading-5 font-semibold text-ink">{s.name}</div>
                    <div className="text-[14px] leading-5 text-body tabular-nums mt-1">{formatPrecio(s.price)}</div>
                    <div className="text-[13px] leading-5 text-muted">{formatDuracion(s.duration_min)}</div>
                  </button>
                ))}
              </div>

              {/* Equipo: sólo cuando hay algo para elegir. Si el servicio lo
                  hace una sola persona, ya quedó elegida sola y mostrar un
                  selector de una opción es ruido. */}
              {elegibles.length > 1 && (
                <>
                  <div className={ui.sectionLabel}>{EQUIPO.selector}</div>
                  <div className="grid grid-cols-3 gap-2 mb-8">
                    {elegibles.map((b) => (
                      <button key={b.id} onClick={() => { setMember(b); setTime(null); setError(""); }}
                        aria-pressed={member?.id === b.id} className={ui.opcion(member?.id === b.id)}>
                        <div className="text-[15px] leading-5 font-semibold truncate text-ink">{b.name}</div>
                        {estadoAusencia(b, date) === "completo" && (
                          <div className="text-[13px] leading-5 text-muted mt-0.5">No está ese día</div>
                        )}
                        {estadoAusencia(b, date) === "parcial" && (
                          <div className="text-[13px] leading-5 text-muted mt-0.5">Tiene menos horarios</div>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Servicio que se coordina hablando: nada de calendario. El
                  cliente se va al WhatsApp y el turno lo carga el local después,
                  desde el panel. */}
              {esConsulta ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}
                  className={`${ui.card} p-5 mb-8`}>
                  <h2 className={`${ui.h2} mb-2`}>Este servicio se coordina por WhatsApp</h2>
                  <p className="text-[15px] leading-6 text-muted mb-5">
                    {service!.name} se conversa antes de agendar{member ? `. ${member.name} te` : ". Te"} responde
                    y arreglan día y hora juntos.
                  </p>
                  {waConsulta ? (
                    <a href={waConsulta} target="_blank" rel="noopener noreferrer" className={`${ui.btnPrimary} w-full`}>
                      <IcoMensaje /> Escribir por WhatsApp
                    </a>
                  ) : (
                    <p className="text-[15px] leading-6 text-muted">
                      Todavía no cargaron un número de contacto para este servicio.
                    </p>
                  )}
                </motion.div>
              ) : (
              <>
              <div className={ui.sectionLabel}>Día</div>
              <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
                {days.map((d) => {
                  const ds = fmtDate(d);
                  // Cerrado el local, o la persona elegida no está NINGUNA hora.
                  // Una ausencia parcial no tacha el día: deja menos horarios,
                  // y eso se ve al abrirlo.
                  const isClosed =
                    fullDayClosed.has(ds) || (!!member && estadoAusencia(member, ds) === "completo");
                  return (
                    <DiaBtn key={ds} fecha={d} label={ds === today ? "Hoy" : DAYS_ES[d.getDay()]}
                      on={date === ds} disabled={isClosed}
                      onClick={() => { setDate(ds); setTime(null); setError(""); }} />
                  );
                })}
              </div>

              <div className={ui.sectionLabel}>
                Horario
                {service && <span className="text-faint"> · {service.name} ({formatDuracion(service.duration_min)})</span>}
                {member && <span className="text-faint"> · con {member.name}</span>}
              </div>
              {!service ? (
                <p className="text-[15px] leading-6 text-muted mb-8">Primero elegí un servicio para ver los horarios disponibles.</p>
              ) : elegibles.length > 0 && !member ? (
                <p className="text-[15px] leading-6 text-muted mb-8">Elegí con quién querés reservar para ver sus horarios.</p>
              ) : dayIsClosed || staffAbsent || grid.length === 0 ? (
                <p className="text-[15px] leading-6 text-muted mb-8">
                  {staffAbsent
                    ? `${member!.name} no atiende ese día. Elegí otro día u otra persona.`
                    : "Está cerrado ese día. Elegí otro."}
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2 mb-8">
                  {grid.map((s) => (
                    <button key={s} disabled={!availability[s]} onClick={() => { setTime(s); setError(""); }}
                      aria-pressed={time === s} className={ui.horario(availability[s], time === s)}>{s}</button>
                  ))}
                </div>
              )}
              </>
              )}

              {/* En modo consulta no hay nada que continuar: el paso siguiente
                  es el chat de WhatsApp, no un formulario de reserva. */}
              {!esConsulta && (
                <button onClick={() => goTo(2)} disabled={!service || !time || (elegibles.length > 0 && !member)}
                  className={`${ui.btnPrimary} w-full`}>
                  Continuar
                </button>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.form key="s2" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit"
              // Es un <form> para que Enter confirme desde el teclado del celular.
              // noValidate: los errores los damos nosotros, campo por campo.
              noValidate onSubmit={(e) => { e.preventDefault(); if (!saving) book(); }}>
              <button type="button" onClick={() => goTo(1)} className={`${ui.btnTexto} -ml-1 mb-4`}>
                <IcoAtras /> Atrás
              </button>
              <div className="rounded-2xl bg-surface border border-line px-4 py-3 text-[15px] leading-6 text-muted mb-8">
                <span className="text-ink font-medium">{service?.name}</span> · {diaRelativo(date)} a las{" "}
                <span className="text-ink font-medium tabular-nums">{time}</span>
                {member && <> · con <span className="text-ink font-medium">{member.name}</span></>}
              </div>

              <label className={ui.label} htmlFor="b-name">Tu nombre</label>
              <input id="b-name" value={name} placeholder="Juan Pérez" autoComplete="name"
                onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: undefined }); }}
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
                className={ui.input({ bad: !!fieldErrors.name })} />
              {fieldErrors.name && <p id="name-error" className={ui.fieldError}>{fieldErrors.name}</p>}

              <label className={`${ui.label} mt-5`} htmlFor="b-phone">Tu WhatsApp</label>
              <input id="b-phone" value={phone} placeholder="351 234-5678" type="tel" inputMode="tel" autoComplete="tel"
                onChange={(e) => { setPhone(e.target.value); if (fieldErrors.phone) setFieldErrors({ ...fieldErrors, phone: undefined }); }}
                aria-invalid={!!fieldErrors.phone}
                aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
                className={ui.input({ bad: !!fieldErrors.phone })} />
              {fieldErrors.phone && <p id="phone-error" className={ui.fieldError}>{fieldErrors.phone}</p>}

              {EMAIL_ENABLED && (
                <>
                  <label className={`${ui.label} mt-5`} htmlFor="b-email">
                    Tu email <span className="font-normal text-muted">(opcional)</span>
                  </label>
                  <input id="b-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@gmail.com"
                    type="email" inputMode="email" autoComplete="email" className={ui.input()} />
                  <p className={`${ui.ayuda} mt-2`}>
                    Si lo dejás, te mandamos la confirmación por mail. Podés saltearlo y reservar igual.
                  </p>
                </>
              )}
              <p className={`${ui.ayuda} mt-4 mb-8`}>Solo usamos tus datos para tu turno. No creamos ninguna cuenta.</p>

              {/* Honeypot: invisible para humanos, irresistible para bots.
                  Lo sacamos de pantalla en vez de usar display:none porque
                  varios bots saltean los campos con display:none.
                  aria-hidden + tabIndex=-1 para que no moleste a lectores de
                  pantalla ni al recorrido por teclado. */}
              <input
                ref={honeypotRef}
                type="text"
                name="website"
                defaultValue=""
                tabIndex={-1}
                aria-hidden="true"
                autoComplete="off"
                className="absolute left-[-9999px] top-0 h-0 w-0 opacity-0"
              />

              {error && (
                <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${ui.errorBox} mb-4`}>
                  {error}
                </motion.p>
              )}

              {/* El botón solo se apaga mientras se está reservando. Por campos
                  incompletos NO se deshabilita: validamos al tocar y avisamos
                  campo por campo (CP-10). */}
              <button type="submit" disabled={saving} aria-busy={saving} className={`${ui.btnPrimary} w-full`}>
                {saving ? "Reservando…" : "Confirmar turno"}
              </button>
              <p className="text-[13px] leading-5 text-muted text-center mt-4">
                Al reservar aceptás los{" "}
                <a href="/legales" target="_blank" className="underline underline-offset-2 hover:text-ink transition-colors">
                  Términos y la Política de Privacidad
                </a>{" "}
                de Turnito
              </p>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
      {children}
    </main>
  );
}
