"use client";

import { use, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { computeSlots, normalizeClosed, fullDayClosedSet, toMin, type ClosedEntry, type OpeningRange } from "@/lib/slots";
import { EQUIPO, formatPrecio, formatDuracion } from "@/lib/rubros";

type Service = { id: string; name: string; icon: string; duration_min: number; price: number };
// staff_id null = turno viejo / negocio de una sola agenda → ocupa a todos.
type BusySlot = { time: string; duration_min: number; staff_id: string | null };
// `absences`: días (YYYY-MM-DD) en que esa persona no está.
type StaffMember = { id: string; name: string; absences: string[] };
type ShopInfo = {
  name: string; slug: string; slot_minutes: number; min_notice_min: number;
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

const labelCls = "text-[10px] font-bold uppercase tracking-widest text-[#9AA0AA] mb-2";
const inputCls = "w-full rounded-2xl bg-white border border-[#E3E5E9] px-4 py-3.5 outline-none focus:border-[#014CFF] transition-colors";

const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 60 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -60, transition: { duration: 0.25, ease: EASE } }),
};
const gridStagger = { show: { transition: { staggerChildren: 0.03 } } };
const gridItem = { hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } };

export default function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const supabase = createClient();

  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [step, setStepRaw] = useState(1);
  const [dir, setDir] = useState(1);
  function goTo(n: number) { setDir(n > step ? 1 : -1); setStepRaw(n); }

  const [service, setService] = useState<Service | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [member, setMember] = useState<StaffMember | null>(null);
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

  const days = useMemo(() => getNext7Days(), []);
  const today = fmtDate(new Date());

  useEffect(() => {
    supabase.rpc("public_shop_info", { shop_slug: slug }).then(({ data, error }) => {
      if (error || !data) setNotFound(true);
      else setShop(data as ShopInfo);
    });
    // Equipo: si el negocio no cargó a nadie, es de una sola agenda y todo
    // funciona como siempre (no se muestra el selector).
    supabase.rpc("public_shop_staff", { shop_slug: slug }).then(({ data }) => {
      const list = (data ?? []) as StaffMember[];
      setStaff(list);
      if (list.length === 1) setMember(list[0]); // una sola: no la hacemos elegir
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

  // Si cambia el servicio/persona y el horario elegido ya no entra, deseleccionarlo
  useEffect(() => {
    if (time && !availability[time]) setTime(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, member, availability]);

  async function book() {
    setError(""); setSaving(true);
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug, service_id: service!.id, staff_id: member?.id ?? null,
        date, time, client_name: name.trim(), client_phone: phone.trim(),
        client_email: EMAIL_ENABLED ? email.trim() || null : null,
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

  if (notFound) return <Center><p className="text-[#5E6470]">Este negocio no existe o no está disponible.</p></Center>;
  if (!shop)
    return (
      <main className="min-h-screen bg-[#F0F1F3] p-5">
        <div className="max-w-md mx-auto pt-4 animate-pulse">
          <div className="h-6 w-44 rounded-lg bg-white mb-2" />
          <div className="h-3 w-28 rounded bg-[#E3E5E9] mb-7" />
          <div className="h-3 w-16 rounded bg-[#E3E5E9] mb-3" />
          <div className="grid grid-cols-3 gap-2 mb-6">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-white" />)}
          </div>
          <div className="h-3 w-12 rounded bg-[#E3E5E9] mb-3" />
          <div className="flex gap-2 mb-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-12 h-14 rounded-2xl bg-white" />)}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 rounded-xl bg-white" />)}
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
            className="w-16 h-16 rounded-full bg-[#B4EC5C] text-black flex items-center justify-center text-2xl font-bold mx-auto mb-5">
            ✓
          </motion.div>
          <h1 className="text-2xl font-extrabold text-black mb-1 tracking-tight">¡Turno confirmado!</h1>
          <p className="text-sm text-[#5E6470] mb-6">
            {date === today ? "Hoy" : date} · {time} hs · {shop.name}
            {member ? ` · con ${member.name}` : ""}
          </p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, ease: EASE }}
            className="rounded-3xl bg-white border border-[#E3E5E9] p-5 text-left text-sm mb-4">
            <p className="text-[#5E6470] mb-2">Guardá este link para ver o cancelar tu turno:</p>
            <a href={`/t/${token}`} className="font-mono text-xs text-[#014CFF] font-semibold underline break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}/t/{token}
            </a>
          </motion.div>
          {emailSent ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
              className="rounded-2xl border border-[#E3E5E9] bg-white px-4 py-3">
              <p className="text-xs text-[#1C1F26]">
                📧 Te mandamos la confirmación a <span className="font-bold">{email.trim()}</span>.
              </p>
              <p className="text-[11px] text-[#9AA0AA] mt-1">
                Si no la ves en unos minutos, <span className="text-[#014CFF] font-bold">revisá la carpeta de spam</span> o correo no deseado.
              </p>
            </motion.div>
          ) : (
            <p className="text-xs text-[#9AA0AA]">Guardá este link: es tu comprobante del turno.</p>
          )}
        </motion.div>
      </Center>
    );

  return (
    <main className="min-h-screen bg-[#F0F1F3] text-[#1C1F26] p-5 overflow-x-hidden">
      <div className="max-w-md mx-auto pt-4 pb-16">
        <motion.div className="flex items-center justify-between mb-7"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div>
            <h1 className="text-lg font-extrabold text-black tracking-tight">{shop.name}</h1>
            <p className="text-[11px] text-[#9AA0AA] font-mono">turnito.app/{shop.slug}</p>
          </div>
          <motion.span animate={{ opacity: [1, 0.55, 1] }} transition={{ duration: 2, repeat: Infinity }}
            className="bg-[#B4EC5C] text-black text-[9px] font-extrabold tracking-widest px-3 py-1.5 rounded-full">
            ONLINE
          </motion.span>
        </motion.div>

        <AnimatePresence mode="wait" custom={dir}>
          {step === 1 && (
            <motion.div key="s1" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className={labelCls}>Servicio</div>
              <motion.div className="grid grid-cols-3 gap-2 mb-6" variants={gridStagger} initial="hidden" animate="show">
                {shop.services.map((s) => (
                  <motion.button key={s.id} variants={gridItem} whileTap={{ scale: 0.94 }} onClick={() => setService(s)}
                    className={`rounded-2xl border-[1.5px] p-3 text-center transition-colors ${
                      service?.id === s.id ? "border-[#014CFF] bg-[#E6EDFF]" : "border-[#E3E5E9] bg-white"
                    }`}>
                    <div className="text-xs font-bold text-black">{s.name}</div>
                    <div className="text-[11px] text-[#014CFF] font-bold mt-1">{formatPrecio(s.price)}</div>
                    <div className="text-[10px] text-[#9AA0AA] mt-0.5">{formatDuracion(s.duration_min)}</div>
                  </motion.button>
                ))}
              </motion.div>

              {/* Equipo: sólo si el negocio cargó a más de una persona */}
              {hasStaff && (
                <>
                  <div className={labelCls}>{EQUIPO.selector}</div>
                  <motion.div className="grid grid-cols-3 gap-2 mb-6" variants={gridStagger} initial="hidden" animate="show">
                    {staff.map((b) => (
                      <motion.button key={b.id} variants={gridItem} whileTap={{ scale: 0.94 }}
                        onClick={() => { setMember(b); setTime(null); }}
                        className={`rounded-2xl border-[1.5px] p-3 text-center transition-colors ${
                          member?.id === b.id ? "border-[#014CFF] bg-[#E6EDFF]" : "border-[#E3E5E9] bg-white"
                        }`}>
                        <div className="text-xs font-bold truncate text-black">{b.name}</div>
                        {b.absences.includes(date) && (
                          <div className="text-[10px] text-[#9AA0AA] mt-0.5">no está ese día</div>
                        )}
                      </motion.button>
                    ))}
                  </motion.div>
                </>
              )}

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
                        isClosed ? "border-[#E3E5E9] bg-[#E9EAEE] opacity-45 cursor-not-allowed"
                          : on ? "border-[#014CFF] bg-[#E6EDFF]" : "border-[#E3E5E9] bg-white"
                      }`}>
                      <div className={`text-[8px] uppercase font-semibold ${on && !isClosed ? "text-[#014CFF]" : "text-[#9AA0AA]"}`}>
                        {ds === today ? "Hoy" : DAYS_ES[d.getDay()]}
                      </div>
                      <div className={`text-sm font-bold ${isClosed ? "line-through text-[#9AA0AA]" : on ? "text-[#014CFF]" : "text-black"}`}>
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
                <p className="text-sm text-[#9AA0AA] mb-6">Primero elegí un servicio para ver los horarios disponibles.</p>
              ) : hasStaff && !member ? (
                <p className="text-sm text-[#9AA0AA] mb-6">Elegí con quién querés reservar para ver sus horarios.</p>
              ) : dayIsClosed || staffAbsent || grid.length === 0 ? (
                <p className="text-sm text-[#9AA0AA] mb-6">
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
                          !free ? "border-dashed border-[#E3E5E9] bg-transparent text-[#C2C6CE] line-through"
                            : on ? "border-[#014CFF] bg-[#014CFF] text-white"
                            : "border-[#E3E5E9] bg-white text-[#1C1F26]"
                        }`}>{s}</motion.button>
                    );
                  })}
                </motion.div>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => goTo(2)} disabled={!service || !time || (hasStaff && !member)}
                className="w-full rounded-full bg-[#014CFF] text-white font-bold py-3.5 disabled:opacity-25 transition-opacity">
                Continuar →
              </motion.button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <button onClick={() => goTo(1)} className="text-sm text-[#5E6470] mb-4 hover:text-[#014CFF] transition-colors">← Atrás</button>
              <div className="rounded-2xl bg-white border border-[#E3E5E9] px-4 py-3 text-sm text-[#5E6470] mb-6">
                <span className="text-black font-bold">{service?.name}</span> · {date === today ? "hoy" : date} ·{" "}
                <span className="text-[#014CFF] font-bold">{time} hs</span>
                {member && <> · con <span className="text-black font-bold">{member.name}</span></>}
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
                    Tu email <span className="text-[#C2C6CE] normal-case tracking-normal">— opcional</span>
                  </div>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@gmail.com"
                    type="email" inputMode="email" autoComplete="email"
                    className={`${inputCls} mb-2`} />
                  <p className="text-xs text-[#9AA0AA] mb-1">
                    Si lo dejás, te mandamos la confirmación por mail. Podés saltearlo y reservar igual.
                  </p>
                </>
              )}
              <p className="text-xs text-[#9AA0AA] mb-7">Solo usamos tus datos para tu turno. No creamos ninguna cuenta.</p>

              {error && (
                <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-sm text-red-500 mb-4">{error}</motion.p>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={book} disabled={saving || name.trim().length < 3 || phone.trim().length < 7}
                className="w-full rounded-full bg-[#014CFF] text-white font-bold py-3.5 disabled:opacity-25 transition-opacity">
                {saving ? "Reservando…" : "Confirmar turno →"}
              </motion.button>
              <p className="text-[10px] text-[#9AA0AA] text-center mt-4 leading-relaxed">
                Al reservar aceptás los{" "}
                <a href="/legales" target="_blank" className="underline hover:text-[#014CFF] transition-colors">
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
    <main className="min-h-screen bg-[#F0F1F3] flex items-center justify-center p-6">
      {children}
    </main>
  );
}
