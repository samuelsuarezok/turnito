"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { computeSlots, normalizeClosed, fullDayClosedSet, toMin, type ClosedEntry, type OpeningRange } from "@/lib/slots";
import { EQUIPO, formatPrecio, formatDuracion } from "@/lib/rubros";
import { SITE_DOMAIN } from "@/lib/site";
import { waLink } from "@/lib/contacto";
import ThemeToggle from "@/components/ThemeToggle";

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
// `absences`: días (YYYY-MM-DD) en que esa persona no está.
type StaffMember = { id: string; name: string; absences: string[]; whatsapp?: string | null };
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

const labelCls = "text-[10px] font-bold uppercase tracking-widest text-faint mb-2";
const inputCls = "w-full rounded-2xl bg-surface border border-line px-4 py-3.5 outline-none focus:border-accent transition-colors";

const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 60 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -60, transition: { duration: 0.25, ease: EASE } }),
};
const gridStagger = { show: { transition: { staggerChildren: 0.03 } } };
const gridItem = { hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } };

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

  // La persona elegida no está ese día → para el cliente es lo mismo que cerrado.
  const staffAbsent = !!member && member.absences.includes(date);

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
      closedBlocks,
      busyIntervals,
      minStartMin,
    });
  }, [shop, weekday, date, today, dayIsClosed, staffAbsent, busyIntervals, closedBlocks, service]);

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
    setError(""); setSaving(true);
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

  if (notFound) return <Center><p className="text-muted">Este negocio no existe o no está disponible.</p></Center>;
  if (!shop)
    return (
      <main className="min-h-screen bg-canvas p-5">
        <div className="max-w-md mx-auto pt-4 animate-pulse">
          <div className="h-6 w-44 rounded-lg bg-surface mb-2" />
          <div className="h-3 w-28 rounded bg-line mb-7" />
          <div className="h-3 w-16 rounded bg-line mb-3" />
          <div className="grid grid-cols-3 gap-2 mb-6">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-surface" />)}
          </div>
          <div className="h-3 w-12 rounded bg-line mb-3" />
          <div className="flex gap-2 mb-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-12 h-14 rounded-2xl bg-surface" />)}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 rounded-xl bg-surface" />)}
          </div>
        </div>
      </main>
    );

  if (step === 3 && token)
    return (
      <Center>
        <motion.div className="w-full max-w-sm text-center"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}>
          <motion.div
            initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }}
            className="w-16 h-16 rounded-full bg-highlight text-on-highlight flex items-center justify-center text-2xl font-bold mx-auto mb-5">
            ✓
          </motion.div>
          <h1 className="text-2xl font-extrabold text-ink mb-1 tracking-tight">¡Turno confirmado!</h1>
          <p className="text-sm text-muted mb-6">
            {date === today ? "Hoy" : date} · {time} hs · {shop.name}
            {member ? ` · con ${member.name}` : ""}
          </p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, ease: EASE }}
            className="rounded-3xl bg-surface border border-line p-5 text-left text-sm mb-4">
            <p className="text-muted mb-2">Guardá este link para ver o cancelar tu turno:</p>
            <a href={`/t/${token}`} className="font-mono text-xs text-accent-ink font-semibold underline break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}/t/{token}
            </a>
          </motion.div>
          {emailSent ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
              className="rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="text-xs text-body">
                📧 Te mandamos la confirmación a <span className="font-bold">{email.trim()}</span>.
              </p>
              <p className="text-[11px] text-faint mt-1">
                Si no la ves en unos minutos, <span className="text-accent-ink font-bold">revisá la carpeta de spam</span> o correo no deseado.
              </p>
            </motion.div>
          ) : (
            <p className="text-xs text-faint">Guardá este link: es tu comprobante del turno.</p>
          )}
        </motion.div>
      </Center>
    );

  return (
    <main className="min-h-screen bg-canvas text-body p-5 overflow-x-hidden">
      <div className="max-w-md mx-auto pt-4 pb-16">
        <motion.div className="flex items-center justify-between mb-7"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div>
            <h1 className="text-lg font-extrabold text-ink tracking-tight">{shop.name}</h1>
            <p className="text-[11px] text-faint font-mono">{SITE_DOMAIN}/{shop.slug}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <motion.span animate={{ opacity: [1, 0.55, 1] }} transition={{ duration: 2, repeat: Infinity }}
            className="bg-highlight text-on-highlight text-[9px] font-extrabold tracking-widest px-3 py-1.5 rounded-full">
            ONLINE
          </motion.span>
          </div>
        </motion.div>

        <AnimatePresence mode="wait" custom={dir}>
          {step === 1 && (
            <motion.div key="s1" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className={labelCls}>Servicio</div>
              <motion.div className="grid grid-cols-3 gap-2 mb-6" variants={gridStagger} initial="hidden" animate="show">
                {shop.services.map((s) => (
                  <motion.button key={s.id} variants={gridItem} whileTap={{ scale: 0.94 }} onClick={() => setService(s)}
                    className={`rounded-2xl border-[1.5px] p-3 text-center transition-colors ${
                      service?.id === s.id ? "border-accent bg-accent-soft" : "border-line bg-surface"
                    }`}>
                    <div className="text-xs font-bold text-ink">{s.name}</div>
                    <div className="text-[11px] text-accent-ink font-bold mt-1">{formatPrecio(s.price)}</div>
                    <div className="text-[10px] text-faint mt-0.5">{formatDuracion(s.duration_min)}</div>
                  </motion.button>
                ))}
              </motion.div>

              {/* Equipo: sólo cuando hay algo para elegir. Si el servicio lo
                  hace una sola persona, ya quedó elegida sola y mostrar un
                  selector de una opción es ruido. */}
              {elegibles.length > 1 && (
                <>
                  <div className={labelCls}>{EQUIPO.selector}</div>
                  <motion.div className="grid grid-cols-3 gap-2 mb-6" variants={gridStagger} initial="hidden" animate="show">
                    {elegibles.map((b) => (
                      <motion.button key={b.id} variants={gridItem} whileTap={{ scale: 0.94 }}
                        onClick={() => { setMember(b); setTime(null); }}
                        className={`rounded-2xl border-[1.5px] p-3 text-center transition-colors ${
                          member?.id === b.id ? "border-accent bg-accent-soft" : "border-line bg-surface"
                        }`}>
                        <div className="text-xs font-bold truncate text-ink">{b.name}</div>
                        {b.absences.includes(date) && (
                          <div className="text-[10px] text-faint mt-0.5">no está ese día</div>
                        )}
                      </motion.button>
                    ))}
                  </motion.div>
                </>
              )}

              {/* Servicio que se coordina hablando: nada de calendario. El
                  cliente se va al WhatsApp y el turno lo carga el local después,
                  desde el panel. */}
              {esConsulta ? (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border-[1.5px] border-line bg-surface p-5 mb-6">
                  <div className="text-sm font-bold text-ink mb-1.5">
                    Este servicio se coordina por WhatsApp
                  </div>
                  <p className="text-sm text-muted leading-relaxed mb-4">
                    {service!.name} se conversa antes de agendar{member ? `. ${member.name} te` : ". Te"} responde
                    y arreglan día y hora juntos.
                  </p>
                  {waConsulta ? (
                    <a href={waConsulta} target="_blank" rel="noopener noreferrer"
                      className="block rounded-full bg-accent text-on-accent font-bold text-sm text-center py-3">
                      Escribir por WhatsApp
                    </a>
                  ) : (
                    <p className="text-sm text-faint">
                      Todavía no cargaron un número de contacto para este servicio.
                    </p>
                  )}
                </motion.div>
              ) : (
              <>
              <div className={labelCls}>Día</div>
              <motion.div className="flex gap-2 overflow-x-auto pb-2 mb-6" variants={gridStagger} initial="hidden" animate="show">
                {days.map((d) => {
                  const ds = fmtDate(d);
                  const on = date === ds;
                  // Cerrado el local, o la persona elegida no está: mismo efecto.
                  const isClosed = fullDayClosed.has(ds) || !!member?.absences.includes(ds);
                  return (
                    <motion.button key={ds} variants={gridItem}
                      whileTap={!isClosed ? { scale: 0.92 } : {}}
                      disabled={isClosed}
                      onClick={() => { setDate(ds); setTime(null); }}
                      className={`shrink-0 w-12 rounded-2xl border-[1.5px] py-2 text-center transition-colors ${
                        isClosed ? "border-line bg-line opacity-45 cursor-not-allowed"
                          : on ? "border-accent bg-accent-soft" : "border-line bg-surface"
                      }`}>
                      <div className={`text-[8px] uppercase font-semibold ${on && !isClosed ? "text-accent-ink" : "text-faint"}`}>
                        {ds === today ? "Hoy" : DAYS_ES[d.getDay()]}
                      </div>
                      <div className={`text-sm font-bold ${isClosed ? "line-through text-faint" : on ? "text-accent-ink" : "text-ink"}`}>
                        {d.getDate()}
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>

              <div className={labelCls}>
                Horario{service ? ` · ${service.name} (${formatDuracion(service.duration_min)})` : ""}
                {member ? ` · con ${member.name}` : ""}
              </div>
              {!service ? (
                <p className="text-sm text-faint mb-6">Primero elegí un servicio para ver los horarios disponibles.</p>
              ) : elegibles.length > 0 && !member ? (
                <p className="text-sm text-faint mb-6">Elegí con quién querés reservar para ver sus horarios.</p>
              ) : dayIsClosed || staffAbsent || grid.length === 0 ? (
                <p className="text-sm text-faint mb-6">
                  {staffAbsent
                    ? `${member!.name} no atiende ese día. Elegí otro día u otra persona.`
                    : dayIsClosed ? "Está cerrado ese día. Elegí otro." : "Cerrado este día. Elegí otro."}
                </p>
              ) : (
                <motion.div key={`${date}-${service.id}-${member?.id ?? "solo"}`} className="grid grid-cols-4 gap-2 mb-8" variants={gridStagger} initial="hidden" animate="show">
                  {grid.map((s) => {
                    const free = availability[s];
                    const on = time === s;
                    return (
                      <motion.button key={s} variants={gridItem} whileTap={free ? { scale: 0.92 } : {}}
                        disabled={!free} onClick={() => setTime(s)}
                        className={`rounded-xl border-[1.5px] py-2 text-[11px] font-bold transition-colors ${
                          !free ? "border-dashed border-line bg-transparent text-faint line-through"
                            : on ? "border-accent bg-accent text-on-accent"
                            : "border-line bg-surface text-body"
                        }`}>{s}</motion.button>
                    );
                  })}
                </motion.div>
              )}
              </>
              )}

              {/* En modo consulta no hay nada que continuar: el paso siguiente
                  es el chat de WhatsApp, no un formulario de reserva. */}
              {!esConsulta && (
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => goTo(2)} disabled={!service || !time || (elegibles.length > 0 && !member)}
                  className="w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity">
                  Continuar →
                </motion.button>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <button onClick={() => goTo(1)} className="text-sm text-muted mb-4 hover:text-accent-ink transition-colors">← Atrás</button>
              <div className="rounded-2xl bg-surface border border-line px-4 py-3 text-sm text-muted mb-6">
                <span className="text-ink font-bold">{service?.name}</span> · {date === today ? "hoy" : date} ·{" "}
                <span className="text-accent-ink font-bold">{time} hs</span>
                {member && <> · con <span className="text-ink font-bold">{member.name}</span></>}
              </div>

              <div className={labelCls}>Tu nombre</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez"
                className={`${inputCls} mb-4`} />

              <div className={labelCls}>Tu WhatsApp</div>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="351 234-5678" type="tel"
                className={`${inputCls} ${EMAIL_ENABLED ? "mb-4" : "mb-2"}`} />

              {EMAIL_ENABLED && (
                <>
                  <div className={labelCls}>
                    Tu email <span className="text-faint normal-case tracking-normal">— opcional</span>
                  </div>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@gmail.com"
                    type="email" inputMode="email" autoComplete="email"
                    className={`${inputCls} mb-2`} />
                  <p className="text-xs text-faint mb-1">
                    Si lo dejás, te mandamos la confirmación por mail. Podés saltearlo y reservar igual.
                  </p>
                </>
              )}
              <p className="text-xs text-faint mb-7">Solo usamos tus datos para tu turno. No creamos ninguna cuenta.</p>

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
                <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-sm text-danger mb-4">{error}</motion.p>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={book} disabled={saving || name.trim().length < 3 || phone.trim().length < 7}
                className="w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity">
                {saving ? "Reservando…" : "Confirmar turno →"}
              </motion.button>
              <p className="text-[10px] text-faint text-center mt-4 leading-relaxed">
                Al reservar aceptás los{" "}
                <a href="/legales" target="_blank" className="underline hover:text-accent-ink transition-colors">
                  Términos y la Política de Privacidad
                </a>{" "}
                de Turnito
              </p>
            </motion.div>
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
