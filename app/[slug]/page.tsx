"use client";

// RESERVAS ANIMADAS — REEMPLAZA: app/[slug]/page.tsx

import { use, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

type Service = { id: string; name: string; icon: string; duration_min: number; price: number };
type DayHours = { weekday: number; opens_at: string; closes_at: string };
type ShopInfo = { name: string; slug: string; slot_minutes: number; services: Service[]; hours: DayHours[] };

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const EASE = [0.22, 1, 0.36, 1] as const;

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getNext7Days() {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
}
function buildSlots(hours: DayHours | undefined, slotMinutes: number): string[] {
  if (!hours) return [];
  const [oh, om] = hours.opens_at.slice(0, 5).split(":").map(Number);
  const [ch, cm] = hours.closes_at.slice(0, 5).split(":").map(Number);
  const open = oh * 60 + om, close = ch * 60 + cm;
  const slots: string[] = [];
  for (let t = open; t + slotMinutes <= close; t += slotMinutes) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return slots;
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
  const [date, setDate] = useState(fmtDate(new Date()));
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const days = useMemo(() => getNext7Days(), []);
  const today = fmtDate(new Date());

  useEffect(() => {
    supabase.rpc("public_shop_info", { shop_slug: slug }).then(({ data, error }) => {
      if (error || !data) setNotFound(true);
      else setShop(data as ShopInfo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!shop) return;
    supabase.rpc("public_busy_slots", { shop_slug: slug, on_date: date }).then(({ data }) => {
      setBusy(new Set<string>((data ?? []).map((t: string) => t.slice(0, 5))));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, date]);

  const weekday = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }, [date]);

  const slots = useMemo(() => {
    if (!shop) return [];
    const dayHours = shop.hours.find((h) => h.weekday === weekday);
    let all = buildSlots(dayHours, shop.slot_minutes);
    if (date === today) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      all = all.filter((s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m > nowMin; });
    }
    return all;
  }, [shop, weekday, date, today]);

  async function book() {
    setError(""); setSaving(true);
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, service_id: service!.id, date, time, client_name: name.trim(), client_phone: phone.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo reservar. Probá de nuevo.");
      if (json.code === "SLOT_TAKEN") { goTo(1); setTime(null); setBusy(new Set([...busy, time!])); }
      return;
    }
    setToken(json.token);
    goTo(3);
  }

  if (notFound) return <Center><p className="text-[#6E6E68]">Esta barbería no existe o no está disponible.</p></Center>;
  if (!shop) return <Center><p className="text-[#5A5A54]">Cargando…</p></Center>;

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
          <p className="text-sm text-[#6E6E68] mb-6">{date === today ? "Hoy" : date} · {time} hs · {shop.name}</p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, ease: EASE }}
            className="rounded-3xl bg-[#141414] border border-[#262626] p-5 text-left text-sm mb-4">
            <p className="text-[#6E6E68] mb-2">Guardá este link para ver o cancelar tu turno:</p>
            <a href={`/t/${token}`} className="font-mono text-xs text-[#D8F34E] underline break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}/t/{token}
            </a>
          </motion.div>
          <p className="text-xs text-[#5A5A54]">(Cuando conectemos WhatsApp, este link te va a llegar por mensaje)</p>
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

              <div className={labelCls}>Día</div>
              <motion.div className="flex gap-2 overflow-x-auto pb-2 mb-6" variants={gridStagger} initial="hidden" animate="show">
                {days.map((d) => {
                  const ds = fmtDate(d); const on = date === ds;
                  return (
                    <motion.button key={ds} variants={gridItem} whileTap={{ scale: 0.92 }}
                      onClick={() => { setDate(ds); setTime(null); }}
                      className={`shrink-0 w-12 rounded-2xl border-[1.5px] py-2 text-center transition-colors ${
                        on ? "border-[#D8F34E] bg-[#D8F34E]/10" : "border-[#262626] bg-[#181818]"
                      }`}>
                      <div className={`text-[8px] uppercase ${on ? "text-[#D8F34E]" : "text-[#5A5A54]"}`}>
                        {ds === today ? "Hoy" : DAYS_ES[d.getDay()]}
                      </div>
                      <div className={`text-sm font-bold ${on ? "text-[#D8F34E]" : ""}`}>{d.getDate()}</div>
                    </motion.button>
                  );
                })}
              </motion.div>

              <div className={labelCls}>Horario</div>
              {slots.length === 0 ? (
                <p className="text-sm text-[#5A5A54] mb-6">Cerrado este día. Elegí otro.</p>
              ) : (
                <motion.div key={date} className="grid grid-cols-4 gap-2 mb-8" variants={gridStagger} initial="hidden" animate="show">
                  {slots.map((s) => {
                    const taken = busy.has(s); const on = time === s;
                    return (
                      <motion.button key={s} variants={gridItem} whileTap={!taken ? { scale: 0.92 } : {}}
                        disabled={taken} onClick={() => setTime(s)}
                        className={`rounded-xl border-[1.5px] py-2 text-[11px] font-semibold transition-colors ${
                          taken ? "border-transparent bg-[#141414] text-[#3A3A36] line-through"
                            : on ? "border-[#D8F34E] bg-[#D8F34E] text-[#101010]"
                            : "border-[#262626] bg-[#181818] text-[#C9C9C4]"
                        }`}>{s}</motion.button>
                    );
                  })}
                </motion.div>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => goTo(2)} disabled={!service || !time}
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
              </div>

              <div className={labelCls}>Tu nombre</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez"
                className="w-full mb-4 rounded-2xl bg-[#181818] border border-[#262626] px-4 py-3.5 outline-none focus:border-[#D8F34E] transition-colors" />

              <div className={labelCls}>Tu WhatsApp</div>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="351 234-5678" type="tel"
                className="w-full mb-2 rounded-2xl bg-[#181818] border border-[#262626] px-4 py-3.5 outline-none focus:border-[#D8F34E] transition-colors" />
              <p className="text-xs text-[#5A5A54] mb-7">Solo lo usamos para tu turno. No creamos ninguna cuenta.</p>

              {error && (
                <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-sm text-red-400 mb-4">{error}</motion.p>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={book} disabled={saving || name.trim().length < 3 || phone.trim().length < 7}
                className="w-full rounded-full bg-[#D8F34E] text-[#101010] font-bold py-3.5 disabled:opacity-30">
                {saving ? "Reservando…" : "Confirmar turno →"}
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
