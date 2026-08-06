"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { SITE_DOMAIN } from "@/lib/site";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import { computeSlots, normalizeClosed, fullDayClosedSet, toMin, type ClosedEntry, type OpeningRange } from "@/lib/slots";
import { formatDuracion } from "@/lib/rubros";

type Shop = { id: string; name: string; slug: string };
type StaffMember = { id: string; name: string };
type Appt = {
  id: string; client_name: string; client_phone: string;
  date: string; time: string; status: string;
  staff_id: string | null;
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

// Convierte "351 234-5678" en link de WhatsApp argentino
function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("54") ? digits : `549${digits}`;
  return `https://wa.me/${full}`;
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
  const [loadErr, setLoadErr] = useState(false);

  // Reprogramar turno ("mover")
  const [moving, setMoving] = useState<Appt | null>(null);
  const [schedInfo, setSchedInfo] = useState<SchedInfo | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [moveTime, setMoveTime] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState<MoveBusy[]>([]);
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState("");

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
      .select("id, client_name, client_phone, date, time, status, staff_id, services(name, duration_min)")
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
  function closeMove() { setMoving(null); setMoveTime(null); }

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

  // Horarios libres del día destino, con la duración del turno que se mueve.
  const moveSlots = useMemo(() => {
    if (!moving || !schedInfo) return { grid: [] as string[], availability: {} as Record<string, boolean> };
    if (moveFullDayClosed.has(moveDate)) return { grid: [], availability: {} };
    if (moving.staff_id && absences.has(`${moving.staff_id}|${moveDate}`)) return { grid: [], availability: {} };
    const [y, m, d] = moveDate.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    const dur = moving.services?.duration_min ?? schedInfo.slot_minutes;
    // Excluimos el propio turno del chequeo (si no, chocaría consigo mismo) y,
    // con varias agendas, sólo compiten los turnos de la misma persona.
    const busyIntervals = moveBusy
      .filter((a) => a.id !== moving.id)
      .filter((a) => !moving.staff_id || a.staff_id === null || a.staff_id === moving.staff_id)
      .map((a) => { const s = toMin(a.time); return [s, s + (a.services?.duration_min ?? schedInfo.slot_minutes)] as [number, number]; });
    // Desde el panel NO hay anticipación mínima; sólo no se puede mover al pasado (hoy).
    let minStartMin: number | undefined;
    if (moveDate === today) { const now = new Date(); minStartMin = now.getHours() * 60 + now.getMinutes(); }
    return computeSlots({
      hours: schedInfo.hours, weekday, date: moveDate,
      slotMinutes: schedInfo.slot_minutes, durationMin: dur,
      closedBlocks: normalizeClosed(schedInfo.closed), busyIntervals, minStartMin,
    });
  }, [moving, schedInfo, moveDate, moveBusy, moveFullDayClosed, absences, today]);

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
    setMoving(null); setMoveTime(null);
    if (shop) loadAppts(shop.id, date);
  }

  const staffName = (id: string | null) => staff.find((b) => b.id === id)?.name ?? null;
  // Filtro por persona: null = todos. Los turnos viejos (staff_id null) sólo
  // aparecen en "Todos", que es donde tiene sentido verlos.
  const shownAppts = staffFilter ? appts.filter((a) => a.staff_id === staffFilter) : appts;

  const active = shownAppts.filter((a) => a.status === "confirmed");
  const done = shownAppts.filter((a) => a.status === "done");
  const current = active[0] ?? null;
  const rest = active.slice(1);

  if (loadErr)
    return (
      <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <p className="text-sm font-bold text-ink">No pudimos cargar tu panel</p>
          <p className="text-xs text-muted mt-1 mb-5">Puede ser un problema de conexión. Probá de nuevo.</p>
          <button onClick={() => window.location.reload()}
            className="rounded-full bg-accent text-on-accent font-bold text-sm px-6 py-3">
            Reintentar
          </button>
        </div>
      </main>
    );

  if (!shop)
    return (
      <main className="min-h-screen bg-canvas p-5">
        <div className="max-w-md mx-auto pb-16 animate-pulse">
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
    <main className="min-h-screen bg-canvas text-body p-5">
      <div className="max-w-md mx-auto pb-16">
        {/* header */}
        <motion.div className="flex items-center justify-between pt-2 mb-1"
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div className="flex items-center gap-2.5"><LogoMark size={22} /><h1 className="text-lg font-extrabold text-ink tracking-tight">{shop.name}</h1></div>
          <div className="flex items-center">
            <ThemeToggle className="mr-2.5" />
            <Link href="/panel/config" className="text-[11px] text-accent-ink font-bold mr-3">⚙ Config</Link>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }} className="text-[11px] text-faint underline">Salir</button>
          </div>
        </motion.div>
        <button onClick={copyLink} className="text-[11px] font-mono text-muted mb-6">
          {SITE_DOMAIN}/{shop.slug} <span className={copied ? "text-accent-ink font-bold" : "text-faint"}>{copied ? "✓ copiado" : "· copiar"}</span>
        </button>

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
                <div className={`text-[8px] uppercase font-semibold ${on ? "text-accent-ink" : "text-faint"}`}>{ds === today ? "Hoy" : DAYS_ES[d.getDay()]}</div>
                <div className={`text-sm font-bold ${on ? "text-accent-ink" : "text-ink"}`}>{d.getDate()}</div>
              </motion.button>
            );
          })}
        </motion.div>

        {/* filtro por persona (sólo si el local cargó equipo) */}
        {staff.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            <button onClick={() => setStaffFilter(null)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
                staffFilter === null ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"}`}>
              Todos
            </button>
            {staff.map((b) => {
              const off = absences.has(`${b.id}|${date}`);
              return (
                <button key={b.id} onClick={() => setStaffFilter(b.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
                    staffFilter === b.id ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"}`}>
                  {b.name}{off ? " · libre" : ""}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-between items-baseline mb-4">
          <span className="text-sm font-bold text-ink">{date === today ? "Hoy" : date}</span>
          <span className="text-[11px] text-faint">{done.length} atendidos · {active.length} en cola</span>
        </div>

        {/* SIGUIENTE */}
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div key={current.id}
              initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -12 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="rounded-3xl bg-highlight text-on-highlight p-5 mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-black text-highlight text-[8px] font-black tracking-[0.15em] px-3.5 py-1.5 rounded-bl-2xl">SIGUIENTE</div>
              <div className="flex items-center gap-4">
                <div className="text-3xl font-extrabold tracking-tight">{current.time.slice(0, 5)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold truncate">{current.client_name}</div>
                  <div className="text-xs opacity-75 mt-0.5">
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
                  className="flex-1 rounded-full bg-black text-white font-bold text-sm py-3">✓ Listo, siguiente</motion.button>
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => setStatus(current.id, "no_show")}
                  className="rounded-full border-[1.5px] border-black/25 text-on-highlight text-xs font-bold px-5">No vino</motion.button>
              </div>
              <button onClick={() => openMove(current)}
                className="w-full text-center text-[11px] font-bold text-on-highlight/55 mt-2.5 underline underline-offset-2">
                🕐 Mover a otro horario
              </button>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-line bg-surface p-8 text-center mb-4">
              {shownAppts.length === 0 ? (
                <>
                  <div className="text-3xl mb-3">📅</div>
                  <p className="text-sm font-bold text-ink">Todavía no hay turnos este día</p>
                  <p className="text-xs text-faint mt-1 mb-5">Compartí tu link para recibir el primero</p>
                  <motion.button whileTap={{ scale: 0.96 }} onClick={copyLink}
                    className="rounded-full bg-accent text-on-accent font-bold text-sm px-6 py-2.5">
                    {copied ? "✓ Link copiado" : "Copiar mi link"}
                  </motion.button>
                </>
              ) : (
                <>
                  <div className="text-3xl mb-3">🎉</div>
                  <p className="text-sm font-bold text-ink">¡Día completado!</p>
                  <p className="text-xs text-faint mt-1">Atendiste todos los turnos. Bien ahí.</p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

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
                    <div className="w-6 h-6 rounded-full bg-canvas border border-line text-muted text-[10px] font-bold flex items-center justify-center shrink-0">{i + 2}</div>
                    <div className="font-mono text-sm font-bold w-11 text-accent-ink">{a.time.slice(0, 5)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate text-ink">{a.client_name}</div>
                      <div className="text-[10px] text-faint">
                        {a.services?.name}
                        {staffName(a.staff_id) ? ` · ${staffName(a.staff_id)}` : ""} ·{" "}
                        <a href={waLink(a.client_phone)} target="_blank" rel="noopener noreferrer"
                          className="underline text-muted hover:text-accent-ink">
                          💬 {a.client_phone}
                        </a>
                      </div>
                    </div>
                    <button onClick={() => openMove(a)} className="text-faint hover:text-accent-ink text-sm px-1" title="Mover turno">🕐</button>
                    <button onClick={() => setStatus(a.id, "cancelled_by_shop")} className="text-faint hover:text-danger text-sm px-1" title="Cancelar turno">✕</button>
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
                <span className="text-accent-ink text-sm">✓</span>
                <span className="font-mono text-xs w-11">{a.time.slice(0, 5)}</span>
                <span className="text-sm line-through">{a.client_name}</span>
              </motion.div>
            ))}
          </>
        )}
      </div>

      {/* MODAL REPROGRAMAR TURNO */}
      <AnimatePresence>
        {moving && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeMove}
            className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center">
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-extrabold text-ink">Mover turno</h2>
                <button onClick={closeMove} className="text-faint text-lg leading-none px-1">✕</button>
              </div>
              <p className="text-xs text-muted mb-4">
                {moving.client_name} · {moving.services?.name} ({formatDuracion(moving.services?.duration_min ?? 0)})
                {staffName(moving.staff_id) ? ` · con ${staffName(moving.staff_id)}` : ""}
              </p>

              {!schedInfo ? (
                <p className="text-sm text-faint py-6 text-center">Cargando horarios…</p>
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
                          <div className={`text-[8px] uppercase font-semibold ${on && !closed ? "text-accent-ink" : "text-faint"}`}>{ds === today ? "Hoy" : DAYS_ES[d.getDay()]}</div>
                          <div className={`text-sm font-bold ${on ? "text-accent-ink" : "text-ink"}`}>{d.getDate()}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* horarios libres */}
                  {moveSlots.grid.length === 0 ? (
                    <p className="text-sm text-faint py-4 text-center">
                      {moving.staff_id && absences.has(`${moving.staff_id}|${moveDate}`)
                        ? `${staffName(moving.staff_id)} no está ese día. Elegí otro.`
                        : "Cerrado ese día. Elegí otro."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {moveSlots.grid.map((s) => {
                        const free = moveSlots.availability[s]; const on = moveTime === s;
                        return (
                          <button key={s} disabled={!free} onClick={() => setMoveTime(s)}
                            className={`rounded-xl border-[1.5px] py-2 text-[11px] font-bold transition-colors ${
                              !free ? "border-dashed border-line bg-transparent text-faint line-through"
                                : on ? "border-accent bg-accent text-on-accent"
                                : "border-line bg-surface text-body"}`}>{s}</button>
                        );
                      })}
                    </div>
                  )}

                  {moveError && <p className="text-sm text-danger mb-3 text-center">{moveError}</p>}

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
  return <div className={`text-[10px] font-bold uppercase tracking-widest text-faint mb-2 ${className}`}>{children}</div>;
}
