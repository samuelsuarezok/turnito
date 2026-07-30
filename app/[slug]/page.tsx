"use client";



import { use, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { computeSlots, normalizeClosed, fullDayClosedSet, toMin, type ClosedEntry, type OpeningRange } from "@/lib/slots";

type Service = { id: string; name: string; icon: string; duration_min: number; price: number };
// barber_id null = turno viejo / barbería de un solo sillón → ocupa a todos.
type BusySlot = { time: string; duration_min: number; barber_id: string | null };
// `absences`: días (YYYY-MM-DD) en que ese barbero no está.
type Barber = { id: string; name: string; absences: string[] };
type ShopInfo = {
  name: string; slug: string; slot_minutes: number; min_notice_min: number;
  services: Service[]; hours: OpeningRange[]; closed: ClosedEntry[];
};

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const EASE = [0.22, 1, 0.36, 1] as const;

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getNext7Days() {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
}
const labelCls = "text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2";
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
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [barber, setBarber] = useState<Barber | null>(null);
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
    // Barberos: si la barbería no cargó ninguno, es de un solo sillón y todo
    // funciona como siempre (no se muestra el selector).
    supabase.rpc("public_shop_barbers", { shop_slug: slug }).then(({ data }) => {
      const list = (data ?? []) as Barber[];
      setBarbers(list);
      if (list.length === 1) setBarber(list[0]); // uno solo: no lo hacemos elegir
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!shop) return;
    loadBusy(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, date]);

  // v2 trae barber_id. Si todavía no existe (migración sin correr), caemos a la
  // vieja: sin barber_id todo ocupa a todos, que es el comportamiento de siempre.
  async function loadBusy(onDate: string) {
    const { data, error } = await supabase.rpc("public_busy_slots_v2", { shop_slug: slug, on_date: onDate });
    if (!error) return setBusy((data ?? []) as BusySlot[]);
    const { data: legacy } = await supabase.rpc("public_busy_slots", { shop_slug: slug, on_date: onDate });
    setBusy(((legacy ?? []) as Omit<BusySlot, "barber_id">[]).map((b) => ({ ...b, barber_id: null })));
  }

  const weekday = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }, [date]);

  // Bloqueos normalizados + set de días completos (lógica en lib/slots).
  const closedBlocks = useMemo(() => normalizeClosed(shop?.closed), [shop]);
  const fullDayClosed = useMemo(() => fullDayClosedSet(closedBlocks), [closedBlocks]);
  const dayIsClosed = fullDayClosed.has(date);

  const hasBarbers = barbers.length > 0;
  // El barbero elegido no está ese día → para el cliente es lo mismo que cerrado.
  const barberAbsent = !!barber && barber.absences.includes(date);

  // Intervalos ocupados en minutos: [inicio, fin)
  // Con varios barberos, cada uno tiene su agenda: sólo lo ocupan sus propios
  // turnos (más los de barber_id null, que son de cuando había un solo sillón).
  const busyIntervals = useMemo(
    () =>
      busy
        .filter((b) => !hasBarbers || !barber || b.barber_id === null || b.barber_id === barber.id)
        .map((b) => { const s = toMin(b.time); return [s, s + b.duration_min] as [number, number]; }),
    [busy, hasBarbers, barber]
  );

  // Grilla + disponibilidad según la DURACIÓN del servicio elegido.
  // Lógica unificada en lib/slots (la misma que usa el panel para reprogramar).
  const { grid, availability } = useMemo(() => {
    if (!shop || dayIsClosed || barberAbsent) return { grid: [] as string[], availability: {} as Record<string, boolean> };
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
  }, [shop, weekday, date, today, dayIsClosed, barberAbsent, busyIntervals, closedBlocks, service]);

  // Si cambia el servicio/barbero y el horario elegido ya no entra, deseleccionarlo
  useEffect(() => {
    if (time && !availability[time]) setTime(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, barber, availability]);

  async function book() {
    setError(""); setSaving(true);
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug, service_id: service!.id, barber_id: barber?.id ?? null,
        date, time, client_name: name.trim(), client_phone: phone.trim(),
        client_email: email.trim() || null,
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

  if (notFound) return <Center><p className="text-[#6E6E68]">Esta barbería no existe o no está disponible.</p></Center>;
  if (!shop)
    return (
      <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] p-5">
        <div className="max-w-md mx-auto pt-4 animate-pulse">
          <div className="h-6 w-44 rounded-lg bg-[#1a1a1a] mb-2" />
          <div className="h-3 w-28 rounded bg-[#141414] mb-7" />
          <div className="h-3 w-16 rounded bg-[#141414] mb-3" />
          <div className="grid grid-cols-3 gap-2 mb-6">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-[#141414]" />)}
          </div>
          <div className="h-3 w-12 rounded bg-[#141414] mb-3" />
          <div className="flex gap-2 mb-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-12 h-14 rounded-2xl bg-[#141414]" />)}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 rounded-xl bg-[#141414]" />)}
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
            className="w-16 h-16 rounded-full bg-[#D8F34E] text-[#101010] flex items-center justify-center text-2xl font-bold mx-auto mb-5">
            ✓
          </motion.div>
          <h1 className="text-2xl font-bold mb-1">¡Turno confirmado!</h1>
          <p className="text-sm text-[#6E6E68] mb-6">
            {date === today ? "Hoy" : date} · {time} hs · {shop.name}
            {barber ? ` · con ${barber.name}` : ""}
          </p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, ease: EASE }}
            className="rounded-3xl bg-[#141414] border border-[#262626] p-5 text-left text-sm mb-4">
            <p className="text-[#6E6E68] mb-2">Guardá este link para ver o cancelar tu turno:</p>
            <a href={`/t/${token}`} className="font-mono text-xs text-[#D8F34E] underline break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}/t/{token}
            </a>
          </motion.div>
          {emailSent ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
              className="rounded-2xl border border-[#262626] bg-[#141414] px-4 py-3">
              <p className="text-xs text-[#C9C9C4]">
                📧 Te mandamos la confirmación a <span className="font-semibold">{email.trim()}</span>.
              </p>
              <p className="text-[11px] text-[#5A5A54] mt-1">
                Si no la ves en unos minutos, <span className="text-[#D8F34E] font-semibold">revisá la carpeta de spam</span> o correo no deseado.
              </p>
            </motion.div>
          ) : (
            <p className="text-xs text-[#5A5A54]">Guardá este link: es tu comprobante del turno.</p>
          )}
        </motion.div>
      </Center>
    );

  return (
    <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] p-5 overflow-x-hidden">
      <div className="max-w-md mx-auto pt-4 pb-16">
        <motion.div className="flex items-center justify-between mb-7"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div>
            <h1 className="text-lg font-bold">{shop.name}</h1>
            <p className="text-[11px] text-[#5A5A54] font-mono">turnito.app/{shop.slug}</p>
          </div>
          <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }}
            className="bg-[#D8F34E]/15 text-[#D8F34E] text-[9px] font-bold tracking-widest px-3 py-1.5 rounded-full">
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
                      service?.id === s.id ? "border-[#D8F34E] bg-[#D8F34E]/10" : "border-[#262626] bg-[#181818]"
                    }`}>
                    <div className="text-xs font-semibold">{s.name}</div>
                    <div className="text-[11px] text-[#D8F34E] font-semibold mt-1">${s.price.toLocaleString("es-AR")}</div>
                    <div className="text-[10px] text-[#5A5A54] mt-0.5">{s.duration_min} min</div>
                  </motion.button>
                ))}
              </motion.div>

              {/* Barbero: sólo si la barbería cargó barberos */}
              {hasBarbers && (
                <>
                  <div className={labelCls}>Barbero</div>
                  <motion.div className="grid grid-cols-3 gap-2 mb-6" variants={gridStagger} initial="hidden" animate="show">
                    {barbers.map((b) => (
                      <motion.button key={b.id} variants={gridItem} whileTap={{ scale: 0.94 }}
                        onClick={() => { setBarber(b); setTime(null); }}
                        className={`rounded-2xl border-[1.5px] p-3 text-center transition-colors ${
                          barber?.id === b.id ? "border-[#D8F34E] bg-[#D8F34E]/10" : "border-[#262626] bg-[#181818]"
                        }`}>
                        <div className="text-xs font-semibold truncate">{b.name}</div>
                        {b.absences.includes(date) && (
                          <div className="text-[10px] text-[#5A5A54] mt-0.5">no está ese día</div>
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
                  // Cerrado el local, o el barbero elegido no está: mismo efecto.
                  const isClosed = fullDayClosed.has(ds) || !!barber?.absences.includes(ds);
                  return (
                    <motion.button key={ds} variants={gridItem}
                      whileTap={!isClosed ? { scale: 0.92 } : {}}
                      disabled={isClosed}
                      onClick={() => { setDate(ds); setTime(null); }}
                      className={`shrink-0 w-12 rounded-2xl border-[1.5px] py-2 text-center transition-colors ${
                        isClosed ? "border-[#1A1A1A] bg-[#111] opacity-30 cursor-not-allowed"
                          : on ? "border-[#D8F34E] bg-[#D8F34E]/10" : "border-[#262626] bg-[#181818]"
                      }`}>
                      <div className={`text-[8px] uppercase ${on && !isClosed ? "text-[#D8F34E]" : "text-[#5A5A54]"}`}>
                        {ds === today ? "Hoy" : DAYS_ES[d.getDay()]}
                      </div>
                      <div className={`text-sm font-bold ${isClosed ? "line-through" : on ? "text-[#D8F34E]" : ""}`}>
                        {d.getDate()}
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>

              <div className={labelCls}>
                Horario{service ? ` · ${service.name} (${service.duration_min} min)` : ""}
                {barber ? ` · con ${barber.name}` : ""}
              </div>
              {!service ? (
                <p className="text-sm text-[#5A5A54] mb-6">Primero elegí un servicio para ver los horarios disponibles.</p>
              ) : hasBarbers && !barber ? (
                <p className="text-sm text-[#5A5A54] mb-6">Elegí con qué barbero querés cortarte para ver sus horarios.</p>
              ) : dayIsClosed || barberAbsent || grid.length === 0 ? (
                <p className="text-sm text-[#5A5A54] mb-6">
                  {barberAbsent
                    ? `${barber!.name} no atiende ese día. Elegí otro día u otro barbero.`
                    : dayIsClosed ? "La barbería está cerrada ese día. Elegí otro." : "Cerrado este día. Elegí otro."}
                </p>
              ) : (
                <motion.div key={`${date}-${service.id}-${barber?.id ?? "solo"}`} className="grid grid-cols-4 gap-2 mb-8" variants={gridStagger} initial="hidden" animate="show">
                  {grid.map((s) => {
                    const free = availability[s];
                    const on = time === s;
                    return (
                      <motion.button key={s} variants={gridItem} whileTap={free ? { scale: 0.92 } : {}}
                        disabled={!free} onClick={() => setTime(s)}
                        className={`rounded-xl border-[1.5px] py-2 text-[11px] font-semibold transition-colors ${
                          !free ? "border-transparent bg-[#141414] text-[#3A3A36] line-through"
                            : on ? "border-[#D8F34E] bg-[#D8F34E] text-[#101010]"
                            : "border-[#262626] bg-[#181818] text-[#C9C9C4]"
                        }`}>{s}</motion.button>
                    );
                  })}
                </motion.div>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => goTo(2)} disabled={!service || !time || (hasBarbers && !barber)}
                className="w-full rounded-full bg-[#D8F34E] text-[#101010] font-bold py-3.5 disabled:opacity-30">
                Continuar →
              </motion.button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <button onClick={() => goTo(1)} className="text-sm text-[#5A5A54] mb-4">← Atrás</button>
              <div className="rounded-2xl bg-[#141414] border border-[#262626] px-4 py-3 text-sm text-[#6E6E68] mb-6">
                <span className="text-[#EDEDEA] font-semibold">{service?.name}</span> · {date === today ? "hoy" : date} ·{" "}
                <span className="text-[#D8F34E] font-semibold">{time} hs</span>
                {barber && <> · con <span className="text-[#EDEDEA] font-semibold">{barber.name}</span></>}
              </div>

              <div className={labelCls}>Tu nombre</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez"
                className="w-full mb-4 rounded-2xl bg-[#181818] border border-[#262626] px-4 py-3.5 outline-none focus:border-[#D8F34E] transition-colors" />

              <div className={labelCls}>Tu WhatsApp</div>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="351 234-5678" type="tel"
                className="w-full mb-4 rounded-2xl bg-[#181818] border border-[#262626] px-4 py-3.5 outline-none focus:border-[#D8F34E] transition-colors" />

              <div className={labelCls}>
                Tu email <span className="text-[#3A3A36] normal-case tracking-normal">— opcional</span>
              </div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@gmail.com"
                type="email" inputMode="email" autoComplete="email"
                className="w-full mb-2 rounded-2xl bg-[#181818] border border-[#262626] px-4 py-3.5 outline-none focus:border-[#D8F34E] transition-colors" />
              <p className="text-xs text-[#5A5A54] mb-7">
                Si lo dejás, te mandamos la confirmación por mail. Podés saltearlo y reservar igual.
                <br />Solo usamos tus datos para tu turno. No creamos ninguna cuenta.
              </p>

              {error && (
                <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-sm text-red-400 mb-4">{error}</motion.p>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={book} disabled={saving || name.trim().length < 3 || phone.trim().length < 7}
                className="w-full rounded-full bg-[#D8F34E] text-[#101010] font-bold py-3.5 disabled:opacity-30">
                {saving ? "Reservando…" : "Confirmar turno →"}
                <p className="text-[10px] text-[#5A5A54] text-center mt-4 leading-relaxed">
                     Al reservar aceptás los{" "}
                  <a href="/legales" target="_blank" className="underline hover:text-[#D8F34E] transition-colors">
                    Términos y la Política de Privacidad
                  </a>
                  {" "}de Turnito
                  </p>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] flex items-center justify-center p-6">
      {children}
    </main>
  );
}
