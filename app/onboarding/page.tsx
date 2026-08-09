"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { SITE_DOMAIN, slugify } from "@/lib/site";
import { motion, AnimatePresence } from "framer-motion";
import {
  RUBROS_LISTA,
  RUBROS,
  DURACION_OPTS,
  formatDuracion,
  type RubroId,
} from "@/lib/rubros";

const EASE = [0.22, 1, 0.36, 1] as const;

// La base valida el slug con  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')  \u2014
// sin guiones dobles, sin gui\u00f3n al principio ni al final. Colapsar y recortar
// los guiones DESPU\u00c9S del slice() es lo que evita que truncar a 30 caracteres
// justo sobre un gui\u00f3n genere un slug inv\u00e1lido y el insert reviente con un
// 23514 crudo en la cara del usuario.
// Vive en lib/site.ts: el panel necesita el MISMO criterio para detectar
// cu\u00e1ndo el link y el nombre del local se despegaron.

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

const inputCls = "w-full rounded-2xl bg-surface border border-line px-4 py-3.5 outline-none focus:border-accent transition-colors";
const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-faint mb-2";
const selectCls = "rounded-xl bg-surface border border-line px-2.5 py-1.5 text-xs outline-none focus:border-accent";

const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 60 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -60, transition: { duration: 0.25, ease: EASE } }),
};

const listStagger = { show: { transition: { staggerChildren: 0.05 } } };
const listItem = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStepRaw] = useState(1);
  const [dir, setDir] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sessionLost, setSessionLost] = useState(false);
  const [checking, setChecking] = useState(true);

  // Borde: si el usuario YA tiene negocio y cae acá (ej: apretó atrás, o entró
  // por URL), evitamos que el insert reviente contra el unique de owner_id con un
  // error críptico. Lo mandamos derecho al panel.
  useEffect(() => {
    async function guard() {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: existing } = await supabase.from("businesses").select("id").maybeSingle();
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

  // ── paso 1: rubro ──
  const [rubroId, setRubroId] = useState<RubroId | null>(null);
  const rubro = rubroId ? RUBROS[rubroId] : null;

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const effectiveSlug = slugEdited ? slug : slugify(name);

  const [services, setServices] = useState<Service[]>([]);
  const [slotMinutes, setSlotMinutes] = useState(30);

  // Elegir rubro precarga los servicios típicos y la grilla de horarios.
  // Precio en 0 = "a consultar": no inventamos números, los pone el dueño.
  function pickRubro(id: RubroId) {
    setRubroId(id);
    const r = RUBROS[id];
    setServices(
      r.servicios.length > 0
        ? r.servicios.map((s) => ({ name: s.name, duration_min: s.duration_min, price: 0 }))
        : [{ name: "", duration_min: 30, price: 0 }]
    );
    setSlotMinutes(r.slotMinutes);
    goTo(2);
  }

  const [hours, setHours] = useState<Record<number, DayHours>>({
    1: { open: true, opens_at: "09:00", closes_at: "19:00" },
    2: { open: true, opens_at: "09:00", closes_at: "19:00" },
    3: { open: true, opens_at: "09:00", closes_at: "19:00" },
    4: { open: true, opens_at: "09:00", closes_at: "19:00" },
    5: { open: true, opens_at: "09:00", closes_at: "19:00" },
    6: { open: true, opens_at: "09:00", closes_at: "14:00" },
    0: { open: false, opens_at: "09:00", closes_at: "13:00" },
  });

  async function finish() {
    setError("");
    setSaving(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        // Sin sesión activa (ej: se registró pero la sesión no quedó, o expiró).
        // Se lo explicamos en vez de patearlo a /login en silencio.
        setSessionLost(true);
        return;
      }

      const { data: shop, error: shopErr } = await supabase
        .from("businesses")
        .insert({
          owner_id: userData.user.id,
          name: name.trim(),
          slug: effectiveSlug,
          whatsapp: whatsapp.trim(),
          slot_minutes: slotMinutes,
          business_type: rubroId ?? "otro",
        })
        .select("id").single();
      if (shopErr) {
        // 23505 = unique violation (slug repetido).
        // 23514 = check violation; el único que puede saltar acá es slug_format.
        setError(
          shopErr.code === "23505" ? "Ese link ya está en uso, probá con otro."
            : shopErr.code === "23514" ? "Ese link tiene caracteres que no podemos usar. Probá con letras y números."
            : shopErr.message
        );
        return;
      }

      const { error: svcErr } = await supabase.from("services").insert(
        services.map((s, i) => ({ business_id: shop.id, name: s.name.trim(), duration_min: s.duration_min, price: s.price, sort_order: i }))
      );
      if (svcErr) { setError(svcErr.message); return; }

      const rows = DAYS.filter((d) => hours[d.weekday].open).map((d) => ({
        business_id: shop.id, weekday: d.weekday, opens_at: hours[d.weekday].opens_at, closes_at: hours[d.weekday].closes_at,
      }));
      const { error: hrsErr } = await supabase.from("opening_hours").insert(rows);
      if (hrsErr) { setError(hrsErr.message); return; }

      router.push("/panel");
    } catch {
      // Red caída / error inesperado: avisamos en vez de dejar "Guardando…" trabado.
      setError("No pudimos crear tu negocio. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const btnPrimary = "w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity";

  if (checking)
    return <main className="min-h-screen bg-canvas flex items-center justify-center"><p className="text-faint">Cargando…</p></main>;

  if (sessionLost)
    return (
      <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <p className="text-sm font-bold text-ink">Tu sesión no está activa</p>
          <p className="text-xs text-muted mt-1 mb-5">Iniciá sesión de nuevo para crear tu negocio. Es un minuto.</p>
          <button onClick={() => router.push("/login")}
            className="rounded-full bg-accent text-on-accent font-bold text-sm px-6 py-3">
            Ir a iniciar sesión
          </button>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-canvas text-body p-6 overflow-x-hidden">
      <div className="max-w-md mx-auto pt-6 pb-16">
        {/* relative + absolute para que el logo quede centrado de verdad: si
            el toggle fuera su hermano en el flex, lo correría a la izquierda. */}
        <motion.div className="relative flex justify-center mb-8" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <Logo size={28} />
          <ThemeToggle className="absolute right-0 top-1/2 -translate-y-1/2" />
        </motion.div>

        {/* progreso */}
        <div className="flex items-center gap-2 mb-10">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
              <motion.div
                animate={{
                  backgroundColor: n <= step ? "#014CFF" : "#FFFFFF",
                  color: n <= step ? "#FFFFFF" : "#9AA0AA",
                  scale: n === step ? 1.12 : 1,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border border-line"
              >
                {n < step ? "✓" : n}
              </motion.div>
              {n < TOTAL_STEPS && (
                <div className="h-px flex-1 bg-line relative overflow-hidden rounded">
                  <motion.div className="absolute inset-y-0 left-0 bg-accent"
                    animate={{ width: n < step ? "100%" : "0%" }} transition={{ duration: 0.4, ease: EASE }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {step > 1 && (
          <button onClick={() => goTo(step - 1)} className="text-sm text-muted mb-4 hover:text-accent-ink transition-colors">← Atrás</button>
        )}

        <AnimatePresence mode="wait" custom={dir}>
          {/* PASO 1 — RUBRO */}
          {step === 1 && (
            <motion.div key="s1" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className="text-2xl font-extrabold text-ink mb-1 tracking-tight">¿A qué te dedicás?</h1>
              <p className="text-sm text-muted mb-8">Para dejarte los servicios típicos ya cargados</p>

              <motion.div variants={listStagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-2.5">
                {RUBROS_LISTA.map((r) => (
                  <motion.button key={r.id} variants={listItem} whileTap={{ scale: 0.96 }}
                    onClick={() => pickRubro(r.id)}
                    className="rounded-3xl bg-surface border-[1.5px] border-line hover:border-accent p-5 text-left transition-colors">
                    <div className="text-2xl mb-2">{r.emoji}</div>
                    <div className="text-sm font-bold text-ink">{r.label}</div>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* PASO 2 — NEGOCIO */}
          {step === 2 && rubro && (
            <motion.div key="s2" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className="text-2xl font-extrabold text-ink mb-1 tracking-tight">Tu {rubro.negocio}</h1>
              <p className="text-sm text-muted mb-8">Los datos básicos del local</p>

              <label className={labelCls}>Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={rubro.ejemploNombre} className={`${inputCls} mb-4`} />

              <label className={labelCls}>WhatsApp del local</label>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="351 234-5678" className={`${inputCls} mb-4`} />

              <label className={labelCls}>Tu link</label>
              <div className="flex items-center rounded-2xl bg-surface border border-line mb-8 focus-within:border-accent transition-colors">
                <span className="pl-4 text-sm text-faint font-mono">{SITE_DOMAIN}/</span>
                <input value={effectiveSlug} onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
                  placeholder={rubro.ejemploSlug} className="flex-1 bg-transparent px-1 py-3.5 outline-none font-mono text-sm text-accent-ink font-semibold" />
              </div>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => goTo(3)}
                disabled={name.trim().length < 3 || whatsapp.trim().length < 7 || !effectiveSlug}
                className={btnPrimary}>Continuar →</motion.button>
            </motion.div>
          )}

          {/* PASO 3 — SERVICIOS */}
          {step === 3 && (
            <motion.div key="s3" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className="text-2xl font-extrabold text-ink mb-1 tracking-tight">Tus servicios</h1>
              <p className="text-sm text-muted mb-8">Con precio y duración. Podés editarlos cuando quieras.</p>

              <motion.div variants={listStagger} initial="hidden" animate="show">
                <AnimatePresence>
                  {services.map((svc, i) => {
                    const aConsultar = svc.price === 0;
                    return (
                      <motion.div key={i} layout variants={listItem}
                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, height: 0, marginBottom: 0 }}
                        className="rounded-3xl bg-surface border border-line p-4 mb-3">
                        <div className="flex gap-2 mb-3">
                          <input value={svc.name}
                            onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))}
                            placeholder="Nombre del servicio"
                            className="flex-1 rounded-xl bg-canvas border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
                          {services.length > 1 && (
                            <button onClick={() => setServices(services.filter((_, j) => j !== i))} className="text-danger px-2">✕</button>
                          )}
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-[9px] text-faint mb-1 uppercase tracking-wider font-bold">Duración</label>
                            <select value={svc.duration_min}
                              onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, duration_min: Number(e.target.value) } : s)))}
                              className={`${selectCls} w-full py-2.5`}>
                              {DURACION_OPTS.map((d) => (<option key={d} value={d}>{formatDuracion(d)}</option>))}
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="block text-[9px] text-faint mb-1 uppercase tracking-wider font-bold">Precio (ARS)</label>
                            <input type="number" value={svc.price || ""} disabled={aConsultar}
                              onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, price: Number(e.target.value) } : s)))}
                              placeholder={aConsultar ? "A consultar" : "3500"}
                              className="w-full rounded-xl bg-canvas border border-line px-3 py-2 text-sm outline-none focus:border-accent disabled:text-faint disabled:italic" />
                          </div>
                        </div>
                        {/* Sin precio de lista: el tatuaje se cotiza por diseño. */}
                        <label className="flex items-center gap-2 mt-3 text-xs text-muted cursor-pointer select-none">
                          <input type="checkbox" checked={aConsultar}
                            onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, price: e.target.checked ? 0 : 1000 } : s)))}
                            className="accent-[var(--c-accent)] w-4 h-4" />
                          Sin precio fijo — mostrar &quot;a consultar&quot;
                        </label>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>

              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => setServices([...services, { name: "", duration_min: rubro?.slotMinutes ?? 30, price: 0 }])}
                className="w-full rounded-3xl border border-dashed border-line py-3.5 text-sm text-accent-ink font-bold mb-8 hover:border-accent transition-colors">
                + Agregar servicio
              </motion.button>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => goTo(4)}
                disabled={services.length === 0 || services.some((s) => !s.name.trim())}
                className={btnPrimary}>Continuar →</motion.button>
            </motion.div>
          )}

          {/* PASO 4 — HORARIOS */}
          {step === 4 && (
            <motion.div key="s4" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className="text-2xl font-extrabold text-ink mb-1 tracking-tight">Tus horarios</h1>
              <p className="text-sm text-muted mb-8">Cuándo está abierto el local</p>

              <motion.div variants={listStagger} initial="hidden" animate="show">
                {DAYS.map((d) => {
                  const h = hours[d.weekday];
                  return (
                    <motion.div key={d.weekday} variants={listItem}
                      animate={{ opacity: h.open ? 1 : 0.5 }}
                      className="flex items-center gap-3 rounded-2xl bg-surface border border-line px-4 py-3 mb-2">
                      <button onClick={() => setHours({ ...hours, [d.weekday]: { ...h, open: !h.open } })}
                        className={`w-10 h-[22px] rounded-full relative transition-colors shrink-0 ${h.open ? "bg-accent" : "bg-line"}`}>
                        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className={`absolute top-[3px] w-4 h-4 rounded-full bg-surface ${h.open ? "left-[22px]" : "left-[3px]"}`} />
                      </button>
                      <span className="text-sm font-bold w-20 text-ink">{d.label}</span>
                      {h.open ? (
                        <div className="flex items-center gap-1.5 ml-auto">
                          <select value={h.opens_at} onChange={(e) => setHours({ ...hours, [d.weekday]: { ...h, opens_at: e.target.value } })} className={selectCls}>
                            {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                          </select>
                          <span className="text-xs text-faint">a</span>
                          <select value={h.closes_at} onChange={(e) => setHours({ ...hours, [d.weekday]: { ...h, closes_at: e.target.value } })} className={selectCls}>
                            {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                          </select>
                        </div>
                      ) : (
                        <span className="ml-auto text-xs text-faint">Cerrado</span>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>

              <label className={`${labelCls} mt-6`}>Cada cuánto arranca un turno</label>
              <div className="flex gap-2 mb-2">
                {[15, 30, 45, 60].map((mm) => (
                  <motion.button key={mm} whileTap={{ scale: 0.94 }} onClick={() => setSlotMinutes(mm)}
                    className={`flex-1 rounded-full py-2.5 text-sm font-bold border transition-colors ${
                      slotMinutes === mm ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"
                    }`}>{mm} min</motion.button>
                ))}
              </div>
              <p className="text-xs text-faint mb-8">
                Es la grilla de horarios que ve tu cliente, no la duración del servicio: un turno de 3 h
                sigue ocupando 3 h.
              </p>

              {error && (
                <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-sm text-danger mb-4">{error}</motion.p>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={finish} disabled={saving} className={btnPrimary}>
                {saving ? "Guardando…" : "Crear mi cuenta →"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
