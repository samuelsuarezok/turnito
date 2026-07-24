"use client";

// ONBOARDING ANIMADO — REEMPLAZA: app/onboarding/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 30);

const DAYS = [
  { weekday: 1, label: "Lunes" }, { weekday: 2, label: "Martes" },
  { weekday: 3, label: "Miércoles" }, { weekday: 4, label: "Jueves" },
  { weekday: 5, label: "Viernes" }, { weekday: 6, label: "Sábado" },
  { weekday: 0, label: "Domingo" },
];

const HOUR_OPTS: string[] = [];
for (let h = 6; h <= 23; h++) {
  HOUR_OPTS.push(`${String(h).padStart(2, "0")}:00`);
  HOUR_OPTS.push(`${String(h).padStart(2, "0")}:30`);
}

type Service = { name: string; duration_min: number; price: number };
type DayHours = { open: boolean; opens_at: string; closes_at: string };

const inputCls = "w-full rounded-2xl bg-[#181818] border border-[#262626] px-4 py-3.5 outline-none focus:border-[#D8F34E] transition-colors";
const labelCls = "block text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2";
const selectCls = "rounded-xl bg-[#181818] border border-[#262626] px-2.5 py-1.5 text-xs outline-none";

// variants del slide entre pasos (dir: 1 adelante, -1 atrás)
const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 60 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -60, transition: { duration: 0.25, ease: EASE } }),
};

const listStagger = { show: { transition: { staggerChildren: 0.05 } } };
const listItem = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStepRaw] = useState(1);
  const [dir, setDir] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sessionLost, setSessionLost] = useState(false);
  const [checking, setChecking] = useState(true);

  // Borde: si el usuario YA tiene barbería y cae acá (ej: apretó atrás, o entró
  // por URL), evitamos que el insert reviente contra el unique de owner_id con un
  // error críptico. Lo mandamos derecho al panel.
  useEffect(() => {
    async function guard() {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: existing } = await supabase.from("barbershops").select("id").maybeSingle();
        if (existing) { router.replace("/panel"); return; }
      }
      setChecking(false);
    }
    guard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(n: number) {
    setDir(n > step ? 1 : -1);
    setStepRaw(n);
  }

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const effectiveSlug = slugEdited ? slug : slugify(name);

  const [services, setServices] = useState<Service[]>([{ name: "Corte", duration_min: 30, price: 0 }]);

  const [hours, setHours] = useState<Record<number, DayHours>>({
    1: { open: true, opens_at: "09:00", closes_at: "19:00" },
    2: { open: true, opens_at: "09:00", closes_at: "19:00" },
    3: { open: true, opens_at: "09:00", closes_at: "19:00" },
    4: { open: true, opens_at: "09:00", closes_at: "19:00" },
    5: { open: true, opens_at: "09:00", closes_at: "19:00" },
    6: { open: true, opens_at: "09:00", closes_at: "14:00" },
    0: { open: false, opens_at: "09:00", closes_at: "13:00" },
  });
  const [slotMinutes, setSlotMinutes] = useState(30);

  async function finish() {
    setError("");
    setSaving(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        // Sin sesión activa (ej: se registró pero la sesión no quedó, o expiró).
        // ANTES: rebotaba a /login EN SILENCIO y el usuario no entendía por qué
        // perdía todo lo que cargó. Ahora se lo explicamos y no lo pateamos.
        setSessionLost(true);
        return;
      }

      const { data: shop, error: shopErr } = await supabase
        .from("barbershops")
        .insert({ owner_id: userData.user.id, name: name.trim(), slug: effectiveSlug, whatsapp: whatsapp.trim(), slot_minutes: slotMinutes })
        .select("id").single();
      if (shopErr) {
        setError(shopErr.code === "23505" ? "Ese link ya está en uso, probá con otro." : shopErr.message);
        return;
      }

      const { error: svcErr } = await supabase.from("services").insert(
        services.map((s, i) => ({ barbershop_id: shop.id, name: s.name.trim(), duration_min: s.duration_min, price: s.price, sort_order: i }))
      );
      if (svcErr) { setError(svcErr.message); return; }

      const rows = DAYS.filter((d) => hours[d.weekday].open).map((d) => ({
        barbershop_id: shop.id, weekday: d.weekday, opens_at: hours[d.weekday].opens_at, closes_at: hours[d.weekday].closes_at,
      }));
      const { error: hrsErr } = await supabase.from("opening_hours").insert(rows);
      if (hrsErr) { setError(hrsErr.message); return; }

      router.push("/panel");
    } catch {
      // Red caída / error inesperado: avisamos en vez de dejar "Guardando…" trabado.
      setError("No pudimos crear tu barbería. Revisá tu conexión e intentá de nuevo.");
    } finally {
      // finally = SIEMPRE apaga el spinner, pase lo que pase.
      setSaving(false);
    }
  }

  const btnPrimary = "w-full rounded-full bg-[#D8F34E] text-[#101010] font-bold py-3.5 disabled:opacity-30";

  // Mientras verificamos si ya tiene barbería, no mostramos el form (evita parpadeo).
  if (checking)
    return <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] flex items-center justify-center"><p className="text-[#5A5A54]">Cargando…</p></main>;

  // Sesión perdida al guardar: pantalla clara con salida, en vez de rebote silencioso.
  if (sessionLost)
    return (
      <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <p className="text-sm font-bold">Tu sesión no está activa</p>
          <p className="text-xs text-[#5A5A54] mt-1 mb-5">Iniciá sesión de nuevo para crear tu barbería. Es un minuto.</p>
          <button onClick={() => router.push("/login")}
            className="rounded-full bg-[#D8F34E] text-[#101010] font-bold text-sm px-6 py-3">
            Ir a iniciar sesión
          </button>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] p-6 overflow-x-hidden">
      <div className="max-w-md mx-auto pt-6 pb-16">
        <motion.div className="flex justify-center mb-8" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <Logo variant="dark" size={28} />
        </motion.div>

        {/* progreso animado */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
              <motion.div
                animate={{
                  backgroundColor: n <= step ? "#D8F34E" : "#181818",
                  color: n <= step ? "#101010" : "#5A5A54",
                  scale: n === step ? 1.12 : 1,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border border-[#262626]"
              >
                {n < step ? "✓" : n}
              </motion.div>
              {n < 3 && (
                <div className="h-px flex-1 bg-[#262626] relative overflow-hidden rounded">
                  <motion.div className="absolute inset-y-0 left-0 bg-[#D8F34E]"
                    animate={{ width: n < step ? "100%" : "0%" }} transition={{ duration: 0.4, ease: EASE }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {step > 1 && (
          <button onClick={() => goTo(step - 1)} className="text-sm text-[#5A5A54] mb-4">← Atrás</button>
        )}

        <AnimatePresence mode="wait" custom={dir}>
          {/* PASO 1 */}
          {step === 1 && (
            <motion.div key="s1" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className="text-2xl font-bold mb-1">Tu barbería</h1>
              <p className="text-sm text-[#6E6E68] mb-8">Los datos básicos del local</p>

              <label className={labelCls}>Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Barbería El Toro" className={`${inputCls} mb-4`} />

              <label className={labelCls}>WhatsApp del local</label>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="351 234-5678" className={`${inputCls} mb-4`} />

              <label className={labelCls}>Tu link</label>
              <div className="flex items-center rounded-2xl bg-[#181818] border border-[#262626] mb-8 focus-within:border-[#D8F34E] transition-colors">
                <span className="pl-4 text-sm text-[#5A5A54] font-mono">turnito.app/</span>
                <input value={effectiveSlug} onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
                  placeholder="tu-barberia" className="flex-1 bg-transparent px-1 py-3.5 outline-none font-mono text-sm text-[#D8F34E]" />
              </div>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => goTo(2)}
                disabled={name.trim().length < 3 || whatsapp.trim().length < 7 || !effectiveSlug}
                className={btnPrimary}>Continuar →</motion.button>
            </motion.div>
          )}

          {/* PASO 2 */}
          {step === 2 && (
            <motion.div key="s2" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className="text-2xl font-bold mb-1">Tus servicios</h1>
              <p className="text-sm text-[#6E6E68] mb-8">Con precio y duración</p>

              <motion.div variants={listStagger} initial="hidden" animate="show">
                <AnimatePresence>
                  {services.map((svc, i) => (
                    <motion.div key={i} layout variants={listItem}
                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, height: 0, marginBottom: 0 }}
                      className="rounded-3xl bg-[#141414] border border-[#262626] p-4 mb-3">
                      <div className="flex gap-2 mb-3">
                        <input value={svc.name}
                          onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))}
                          placeholder="Nombre del servicio"
                          className="flex-1 rounded-xl bg-[#181818] border border-[#262626] px-3 py-2.5 text-sm outline-none focus:border-[#D8F34E]" />
                        {services.length > 1 && (
                          <button onClick={() => setServices(services.filter((_, j) => j !== i))} className="text-red-400 px-2">✕</button>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-[9px] text-[#5A5A54] mb-1 uppercase tracking-wider">Duración</label>
                          <select value={svc.duration_min}
                            onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, duration_min: Number(e.target.value) } : s)))}
                            className={`${selectCls} w-full py-2.5`}>
                            {[15, 20, 30, 45, 60, 90].map((d) => (<option key={d} value={d}>{d} min</option>))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-[9px] text-[#5A5A54] mb-1 uppercase tracking-wider">Precio (ARS)</label>
                          <input type="number" value={svc.price || ""}
                            onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, price: Number(e.target.value) } : s)))}
                            placeholder="3500"
                            className="w-full rounded-xl bg-[#181818] border border-[#262626] px-3 py-2 text-sm outline-none focus:border-[#D8F34E]" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>

              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => setServices([...services, { name: "", duration_min: 30, price: 0 }])}
                className="w-full rounded-3xl border border-dashed border-[#333] py-3.5 text-sm text-[#D8F34E] font-semibold mb-8">
                + Agregar servicio
              </motion.button>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => goTo(3)}
                disabled={services.some((s) => !s.name.trim() || s.price <= 0)}
                className={btnPrimary}>Continuar →</motion.button>
            </motion.div>
          )}

          {/* PASO 3 */}
          {step === 3 && (
            <motion.div key="s3" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className="text-2xl font-bold mb-1">Tus horarios</h1>
              <p className="text-sm text-[#6E6E68] mb-8">Cuándo está abierto el local</p>

              <motion.div variants={listStagger} initial="hidden" animate="show">
                {DAYS.map((d) => {
                  const h = hours[d.weekday];
                  return (
                    <motion.div key={d.weekday} variants={listItem}
                      animate={{ opacity: h.open ? 1 : 0.4 }}
                      className="flex items-center gap-3 rounded-2xl bg-[#141414] border border-[#262626] px-4 py-3 mb-2">
                      <button onClick={() => setHours({ ...hours, [d.weekday]: { ...h, open: !h.open } })}
                        className={`w-10 h-[22px] rounded-full relative transition-colors shrink-0 ${h.open ? "bg-[#D8F34E]" : "bg-[#2A2A2A]"}`}>
                        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className={`absolute top-[3px] w-4 h-4 rounded-full ${h.open ? "left-[22px] bg-[#101010]" : "left-[3px] bg-[#5A5A54]"}`} />
                      </button>
                      <span className="text-sm font-semibold w-20">{d.label}</span>
                      {h.open ? (
                        <div className="flex items-center gap-1.5 ml-auto">
                          <select value={h.opens_at} onChange={(e) => setHours({ ...hours, [d.weekday]: { ...h, opens_at: e.target.value } })} className={selectCls}>
                            {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                          </select>
                          <span className="text-xs text-[#5A5A54]">a</span>
                          <select value={h.closes_at} onChange={(e) => setHours({ ...hours, [d.weekday]: { ...h, closes_at: e.target.value } })} className={selectCls}>
                            {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                          </select>
                        </div>
                      ) : (
                        <span className="ml-auto text-xs text-[#5A5A54]">Cerrado</span>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>

              <label className={`${labelCls} mt-6`}>Duración de cada turno</label>
              <div className="flex gap-2 mb-8">
                {[15, 30, 45, 60].map((m) => (
                  <motion.button key={m} whileTap={{ scale: 0.94 }} onClick={() => setSlotMinutes(m)}
                    className={`flex-1 rounded-full py-2.5 text-sm font-bold border transition-colors ${
                      slotMinutes === m ? "bg-[#D8F34E] text-[#101010] border-[#D8F34E]" : "bg-[#141414] text-[#6E6E68] border-[#262626]"
                    }`}>{m} min</motion.button>
                ))}
              </div>

              {error && (
                <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-sm text-red-400 mb-4">{error}</motion.p>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={finish} disabled={saving} className={btnPrimary}>
                {saving ? "Guardando…" : "Crear mi barbería →"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
