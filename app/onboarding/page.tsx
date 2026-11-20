"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { SITE_DOMAIN, slugify } from "@/lib/site";
import { motion, AnimatePresence } from "framer-motion";
import { IcoAtras, IcoCheck, IcoPlus, IcoSeguir, IcoX } from "@/components/icons";
import * as ui from "@/lib/ui";
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

// Los pasos se deslizan apenas (16px) en la dirección en que se avanza.
const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 16 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -16, transition: { duration: 0.2, ease: EASE } }),
};

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

  const btnPrimary = `${ui.btnPrimary} w-full`;

  if (checking)
    return <main className="min-h-screen bg-canvas flex items-center justify-center"><p className="text-[15px] text-muted">Cargando…</p></main>;

  if (sessionLost)
    return (
      <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <p className="text-[18px] leading-6 font-semibold text-ink">Tu sesión no está activa</p>
          <p className="text-[15px] leading-6 text-muted mt-1 mb-6">Iniciá sesión de nuevo para crear tu negocio. Es un minuto.</p>
          <button onClick={() => router.push("/login")} className={ui.btnPrimary}>
            Ir a iniciar sesión
          </button>
        </div>
      </main>
    );

  const subtitulo = "text-[16px] leading-6 text-muted mt-2 mb-8";

  return (
    <main className="min-h-screen bg-canvas text-body p-4 sm:p-6 overflow-x-hidden">
      <div className="max-w-md mx-auto pt-6 pb-16">
        {/* relative + absolute para que el logo quede centrado de verdad: si
            el toggle fuera su hermano en el flex, lo correría a la izquierda. */}
        <div className="relative flex justify-center mb-8">
          <Logo size={28} />
          <ThemeToggle className="absolute right-0 top-1/2 -translate-y-1/2" />
        </div>

        {/* progreso. Antes los colores estaban escritos en hex adentro de la
            animación (#014CFF, #FFFFFF) y en modo noche quedaban círculos
            blancos sobre negro. Ahora salen de los tokens. */}
        <div className="flex items-center gap-2 mb-10" aria-label={`Paso ${step} de ${TOTAL_STEPS}`}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-medium tabular-nums shrink-0 border transition-colors duration-200 ${
                n <= step ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"}`}>
                {n < step ? <IcoCheck size={14} /> : n}
              </div>
              {n < TOTAL_STEPS && (
                <div className="h-px flex-1 bg-line relative overflow-hidden">
                  {/* scaleX y no width: se anima con transform, sin recalcular layout. */}
                  <motion.div className="absolute inset-0 bg-accent origin-left"
                    initial={false} animate={{ scaleX: n < step ? 1 : 0 }} transition={{ duration: 0.3, ease: EASE }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {step > 1 && (
          <button onClick={() => goTo(step - 1)} className={`${ui.btnTexto} -ml-1 mb-4`}>
            <IcoAtras /> Atrás
          </button>
        )}

        <AnimatePresence mode="wait" custom={dir}>
          {/* PASO 1 — RUBRO */}
          {step === 1 && (
            <motion.div key="s1" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className={ui.h1}>¿A qué te dedicás?</h1>
              <p className={subtitulo}>Para dejarte los servicios típicos ya cargados</p>

              {/* Cada opción dice qué servicios se precargan: eso es lo que el
                  dueño está eligiendo, y antes sólo se veía un emoji. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {RUBROS_LISTA.map((r) => (
                  <button key={r.id} onClick={() => pickRubro(r.id)}
                    className="group flex items-center gap-3 rounded-2xl bg-surface border border-line hover:border-accent px-4 py-4 text-left transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-[16px] leading-6 font-semibold text-ink">{r.label}</div>
                      <div className="text-[13px] leading-5 text-muted truncate">
                        {r.servicios.length > 0 ? r.servicios.map((x) => x.name).join(", ") : "Cargás tus propios servicios"}
                      </div>
                    </div>
                    <IcoSeguir className="text-faint group-hover:text-accent-ink transition-colors" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* PASO 2 — NEGOCIO */}
          {step === 2 && rubro && (
            <motion.div key="s2" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className={ui.h1}>Tu {rubro.negocio}</h1>
              <p className={subtitulo}>Los datos básicos del local</p>

              <label className={ui.label} htmlFor="o-nombre">Nombre</label>
              <input id="o-nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder={rubro.ejemploNombre}
                autoComplete="organization" className={`${ui.input()} mb-5`} />

              <label className={ui.label} htmlFor="o-wa">WhatsApp del local</label>
              <input id="o-wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="351 234-5678"
                type="tel" inputMode="tel" className={`${ui.input()} mb-5`} />

              <label className={ui.label} htmlFor="o-slug">Tu link</label>
              <div className="flex items-center h-12 rounded-xl bg-surface border border-line mb-8 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--c-accent-soft)]">
                <span className="pl-4 text-[15px] text-muted font-mono">{SITE_DOMAIN}/</span>
                <input id="o-slug" value={effectiveSlug} onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
                  placeholder={rubro.ejemploSlug} autoCapitalize="none" spellCheck={false}
                  className="flex-1 min-w-0 h-full bg-transparent pr-4 outline-none font-mono text-[15px] text-ink placeholder:text-faint" />
              </div>

              <button onClick={() => goTo(3)}
                disabled={name.trim().length < 3 || whatsapp.trim().length < 7 || !effectiveSlug}
                className={btnPrimary}>Continuar</button>
            </motion.div>
          )}

          {/* PASO 3 — SERVICIOS */}
          {step === 3 && (
            <motion.div key="s3" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className={ui.h1}>Tus servicios</h1>
              <p className={subtitulo}>Con precio y duración. Podés editarlos cuando quieras.</p>

              <AnimatePresence initial={false}>
                {services.map((svc, i) => {
                  const aConsultar = svc.price === 0;
                  return (
                    <motion.div key={i} layout
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="rounded-2xl bg-surface border border-line p-4 mb-3">
                      <div className="flex gap-2 mb-3">
                        <input value={svc.name} aria-label="Nombre del servicio"
                          onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))}
                          placeholder="Nombre del servicio"
                          className={`${ui.input({ bg: "bg-canvas" })} flex-1`} />
                        {services.length > 1 && (
                          <button onClick={() => setServices(services.filter((_, j) => j !== i))}
                            className={`${ui.iconBtn} h-12! w-12! hover:text-danger`} aria-label="Quitar servicio">
                            <IcoX />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-[13px] leading-5 text-muted mb-1">Duración</label>
                          <select value={svc.duration_min}
                            onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, duration_min: Number(e.target.value) } : s)))}
                            className={`${ui.select} w-full h-12! bg-canvas!`}>
                            {DURACION_OPTS.map((d) => (<option key={d} value={d}>{formatDuracion(d)}</option>))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-[13px] leading-5 text-muted mb-1">Precio (ARS)</label>
                          <input type="number" inputMode="numeric" value={svc.price || ""} disabled={aConsultar}
                            onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, price: Number(e.target.value) } : s)))}
                            placeholder={aConsultar ? "A consultar" : "3500"}
                            className={`${ui.input({ bg: "bg-canvas" })} tabular-nums`} />
                        </div>
                      </div>
                      {/* Sin precio de lista: el tatuaje se cotiza por diseño. */}
                      <label className="flex items-center gap-2 mt-3 text-[14px] leading-5 text-muted cursor-pointer select-none">
                        <input type="checkbox" checked={aConsultar}
                          onChange={(e) => setServices(services.map((s, j) => (j === i ? { ...s, price: e.target.checked ? 0 : 1000 } : s)))}
                          className="accent-[var(--c-accent)] w-4 h-4" />
                        Sin precio fijo: mostrar &quot;a consultar&quot;
                      </label>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              <button onClick={() => setServices([...services, { name: "", duration_min: rubro?.slotMinutes ?? 30, price: 0 }])}
                className={`${ui.btnAgregar} mb-8`}>
                <IcoPlus /> Agregar servicio
              </button>

              <button onClick={() => goTo(4)}
                disabled={services.length === 0 || services.some((s) => !s.name.trim())}
                className={btnPrimary}>Continuar</button>
            </motion.div>
          )}

          {/* PASO 4 — HORARIOS */}
          {step === 4 && (
            <motion.div key="s4" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
              <h1 className={ui.h1}>Tus horarios</h1>
              <p className={subtitulo}>Cuándo está abierto el local</p>

              <div className="flex flex-col gap-2">
                {DAYS.map((d) => {
                  const h = hours[d.weekday];
                  return (
                    <div key={d.weekday}
                      className={`flex items-center gap-3 rounded-xl bg-surface border border-line px-4 h-14 transition-opacity ${h.open ? "" : "opacity-60"}`}>
                      <button onClick={() => setHours({ ...hours, [d.weekday]: { ...h, open: !h.open } })}
                        role="switch" aria-checked={h.open} aria-label={`${d.label} abierto`}
                        className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${h.open ? "bg-accent" : "bg-line"}`}>
                        {/* transform y no `left`: se mueve sin recalcular layout. */}
                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-surface transition-transform duration-200 ease-out ${h.open ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                      <span className="text-[16px] font-medium w-24 text-ink">{d.label}</span>
                      {h.open ? (
                        <div className="flex items-center gap-1.5 ml-auto">
                          <select value={h.opens_at} aria-label={`${d.label} abre`} onChange={(e) => setHours({ ...hours, [d.weekday]: { ...h, opens_at: e.target.value } })} className={ui.select}>
                            {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                          </select>
                          <span className="text-[14px] text-muted">a</span>
                          <select value={h.closes_at} aria-label={`${d.label} cierra`} onChange={(e) => setHours({ ...hours, [d.weekday]: { ...h, closes_at: e.target.value } })} className={ui.select}>
                            {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                          </select>
                        </div>
                      ) : (
                        <span className="ml-auto text-[14px] text-muted">Cerrado</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className={`${ui.label} mt-8`}>Cada cuánto arranca un turno</div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[15, 30, 45, 60].map((mm) => (
                  <button key={mm} onClick={() => setSlotMinutes(mm)} aria-pressed={slotMinutes === mm}
                    className={`${ui.chip(slotMinutes === mm)} justify-center h-10!`}>{mm} min</button>
                ))}
              </div>
              <p className={`${ui.ayuda} mb-8`}>
                Es la grilla de horarios que ve tu cliente, no la duración del servicio: un turno de 3 h
                sigue ocupando 3 h.
              </p>

              {error && (
                <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${ui.errorBox} mb-4`}>{error}</motion.p>
              )}

              <button onClick={finish} disabled={saving} aria-busy={saving} className={btnPrimary}>
                {saving ? "Guardando…" : "Crear mi negocio"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
