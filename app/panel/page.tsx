"use client";

// PANEL v3: teléfonos con link a WhatsApp + Config + auto-done
// REEMPLAZA TODO: app/panel/page.tsx

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { motion, AnimatePresence } from "framer-motion";
import { computeSlots, normalizeClosed, fullDayClosedSet, toMin, type ClosedEntry, type OpeningRange } from "@/lib/slots";

type Shop = { id: string; name: string; slug: string };
type Barber = { id: string; name: string };
type Appt = {
  id: string; client_name: string; client_phone: string;
  date: string; time: string; status: string;
  barber_id: string | null;
  services: { name: string; duration_min: number } | null;
};
// Datos de agenda para reprogramar (mismos que usa la reserva pública).
type SchedInfo = { slot_minutes: number; hours: OpeningRange[]; closed: ClosedEntry[] };
type MoveBusy = { id: string; time: string; barber_id: string | null; services: { duration_min: number } | null };

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
  const [barbers, setBarbers] = useState<Barber[]>([]);
  // Días en que cada barbero no está: "barberId|YYYY-MM-DD"
  const [absences, setAbsences] = useState<Set<string>>(new Set());
  const [barberFilter, setBarberFilter] = useState<string | null>(null); // null = todos
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
        const { data, error: sErr } = await supabase.from("barbershops").select("id, name, slug").maybeSingle();
        if (sErr) throw sErr;
        if (!data) return router.push("/onboarding");
        setShop(data);

        // Barberos del local (vacío = un solo sillón, todo como antes)
        const { data: brs } = await supabase
          .from("barbers").select("id, name")
          .eq("barbershop_id", data.id).eq("active", true).order("sort_order");
        const list = (brs ?? []) as Barber[];
        setBarbers(list);

        if (list.length > 0) {
          const { data: abs } = await supabase
            .from("barber_absences").select("barber_id, date")
            .in("barber_id", list.map((b) => b.id))
            .gte("date", fmtDate(new Date()));
          setAbsences(new Set((abs ?? []).map((a) => `${a.barber_id}|${a.date}`)));
        }

        // Marcar como atendidos los turnos confirmados de días pasados
        await supabase
          .from("appointments")
          .update({ status: "done" })
          .eq("barbershop_id", data.id)
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
      .select("id, client_name, client_phone, date, time, status, barber_id, services(name, duration_min)")
      .eq("barbershop_id", shopId).eq("date", onDate).order("time");
    setAppts((data as unknown as Appt[]) ?? []);
  }

  useEffect(() => { if (shop) loadAppts(shop.id, date); /* eslint-disable-next-line */ }, [shop, date]);

  // ── AUTO-REFRESCO (polling) ──────────────────────────────────────────────
  // El barbero ve turnos nuevos sin recargar la página. Encapsulado ACÁ a
  // propósito: el día que Turnito escale y necesite Realtime (WebSocket),
  // se reemplaza SOLO este bloque, sin tocar el resto del panel.
  useEffect(() => {
    if (!shop) return;
    const tick = () => loadAppts(shop.id, date);
    const id = setInterval(tick, 5000); // cada 5s: se siente "vivo" y para una barbería sobra
    // Bonus: al volver a la pestaña, refresca al toque sin esperar los 15s.
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
      .select("id, time, barber_id, services(duration_min)")
      .eq("barbershop_id", shop.id).eq("date", moveDate).in("status", ["confirmed", "done"])
      .then(({ data }) => setMoveBusy((data as unknown as MoveBusy[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, moveDate, shop]);

  const moveFullDayClosed = useMemo(
    () => fullDayClosedSet(normalizeClosed(schedInfo?.closed)),
    [schedInfo]
  );

  // Días en que NO se puede mover este turno: local cerrado o su barbero ausente.
  const moveDayBlocked = (ds: string) =>
    moveFullDayClosed.has(ds) || (!!moving?.barber_id && absences.has(`${moving.barber_id}|${ds}`));

  // Horarios libres del día destino, con la duración del turno que se mueve.
  const moveSlots = useMemo(() => {
    if (!moving || !schedInfo) return { grid: [] as string[], availability: {} as Record<string, boolean> };
    if (moveFullDayClosed.has(moveDate)) return { grid: [], availability: {} };
    if (moving.barber_id && absences.has(`${moving.barber_id}|${moveDate}`)) return { grid: [], availability: {} };
    const [y, m, d] = moveDate.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    const dur = moving.services?.duration_min ?? schedInfo.slot_minutes;
    // Excluimos el propio turno del chequeo (si no, chocaría consigo mismo) y,
    // con varios barberos, sólo compiten los turnos del mismo barbero.
    const busyIntervals = moveBusy
      .filter((a) => a.id !== moving.id)
      .filter((a) => !moving.barber_id || a.barber_id === null || a.barber_id === moving.barber_id)
      .map((a) => { const s = toMin(a.time); return [s, s + (a.services?.duration_min ?? schedInfo.slot_minutes)] as [number, number]; });
    // El barbero NO tiene anticipación mínima; solo no puede mover al pasado (hoy).
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

  const barberName = (id: string | null) => barbers.find((b) => b.id === id)?.name ?? null;
  // Filtro por barbero: null = todos. Los turnos viejos (barber_id null) sólo
  // aparecen en "Todos", que es donde tiene sentido verlos.
  const shownAppts = barberFilter ? appts.filter((a) => a.barber_id === barberFilter) : appts;

  const active = shownAppts.filter((a) => a.status === "confirmed");
  const done = shownAppts.filter((a) => a.status === "done");
  const current = active[0] ?? null;
  const rest = active.slice(1);

  if (loadErr)
    return (
      <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <p className="text-sm font-bold">No pudimos cargar tu panel</p>
          <p className="text-xs text-[#5A5A54] mt-1 mb-5">Puede ser un problema de conexión. Probá de nuevo.</p>
          <button onClick={() => window.location.reload()}
            className="rounded-full bg-[#D8F34E] text-[#101010] font-bold text-sm px-6 py-3">
            Reintentar
          </button>
        </div>
      </main>
    );

  if (!shop)
    return (
      <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] p-5">
        <div className="max-w-md mx-auto pb-16 animate-pulse">
          <div className="flex items-center justify-between pt-2 mb-6">
            <div className="h-6 w-40 rounded-lg bg-[#1a1a1a]" />
            <div className="h-4 w-16 rounded bg-[#1a1a1a]" />
          </div>
          <div className="flex gap-2 mb-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-12 h-14 rounded-2xl bg-[#141414]" />)}
          </div>
          <div className="h-40 rounded-3xl bg-[#141414] mb-4" />
          <div className="h-16 rounded-2xl bg-[#141414] mb-2" />
          <div className="h-16 rounded-2xl bg-[#141414]" />
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] p-5">
      <div className="max-w-md mx-auto pb-16">
        {/* header */}
        <motion.div className="flex items-center justify-between pt-2 mb-1"
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div className="flex items-center gap-2.5"><LogoMark size={22} /><h1 className="text-lg font-bold">{shop.name}</h1></div>
          <div className="flex items-center">
            <Link href="/panel/config" className="text-[11px] text-[#D8F34E] font-semibold mr-3">⚙ Config</Link>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }} className="text-[11px] text-[#5A5A54] underline">Salir</button>
          </div>
        </motion.div>
        <button onClick={copyLink} className="text-[11px] font-mono text-[#6E6E68] mb-6">
          turnito.app/{shop.slug} <span className={copied ? "text-[#D8F34E]" : "text-[#5A5A54]"}>{copied ? "✓ copiado" : "· copiar"}</span>
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
                className={`shrink-0 w-12 rounded-2xl border-[1.5px] py-2 text-center transition-colors ${on ? "border-[#D8F34E] bg-[#D8F34E]/10" : "border-[#262626] bg-[#181818]"}`}>
                <div className={`text-[8px] uppercase ${on ? "text-[#D8F34E]" : "text-[#5A5A54]"}`}>{ds === today ? "Hoy" : DAYS_ES[d.getDay()]}</div>
                <div className={`text-sm font-bold ${on ? "text-[#D8F34E]" : ""}`}>{d.getDate()}</div>
              </motion.button>
            );
          })}
        </motion.div>

        {/* filtro por barbero (sólo si el local tiene barberos cargados) */}
        {barbers.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            <button onClick={() => setBarberFilter(null)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
                barberFilter === null ? "bg-[#D8F34E] text-[#101010] border-[#D8F34E]" : "bg-[#181818] text-[#6E6E68] border-[#262626]"}`}>
              Todos
            </button>
            {barbers.map((b) => {
              const off = absences.has(`${b.id}|${date}`);
              return (
                <button key={b.id} onClick={() => setBarberFilter(b.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
                    barberFilter === b.id ? "bg-[#D8F34E] text-[#101010] border-[#D8F34E]" : "bg-[#181818] text-[#6E6E68] border-[#262626]"}`}>
                  {b.name}{off ? " · libre" : ""}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-between items-baseline mb-4">
          <span className="text-sm font-bold">{date === today ? "Hoy" : date}</span>
          <span className="text-[11px] text-[#5A5A54]">{done.length} atendidos · {active.length} en cola</span>
        </div>

        {/* SIGUIENTE */}
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div key={current.id}
              initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -12 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="rounded-3xl bg-[#D8F34E] text-[#101010] p-5 mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[#101010] text-[#D8F34E] text-[8px] font-black tracking-[0.15em] px-3.5 py-1.5 rounded-bl-2xl">SIGUIENTE</div>
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold" style={{ fontFamily: "var(--font-grotesk)" }}>{current.time.slice(0, 5)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold truncate">{current.client_name}</div>
                  <div className="text-xs opacity-70 mt-0.5">
                    {current.services?.name} · {current.services?.duration_min} min
                    {barberName(current.barber_id) ? ` · con ${barberName(current.barber_id)}` : ""} ·{" "}
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
                  className="flex-1 rounded-full bg-[#101010] text-[#D8F34E] font-bold text-sm py-3">✓ Listo, siguiente</motion.button>
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => setStatus(current.id, "no_show")}
                  className="rounded-full border-[1.5px] border-[#101010]/30 text-[#101010] text-xs font-bold px-5">No vino</motion.button>
              </div>
              <button onClick={() => openMove(current)}
                className="w-full text-center text-[11px] font-bold text-[#101010]/60 mt-2.5 underline underline-offset-2">
                🕐 Mover a otro horario
              </button>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-[#262626] bg-[#141414] p-8 text-center mb-4">
              {shownAppts.length === 0 ? (
                <>
                  <div className="text-3xl mb-3">📅</div>
                  <p className="text-sm font-bold">Todavía no hay turnos este día</p>
                  <p className="text-xs text-[#5A5A54] mt-1 mb-5">Compartí tu link para recibir el primero</p>
                  <motion.button whileTap={{ scale: 0.96 }} onClick={copyLink}
                    className="rounded-full bg-[#D8F34E] text-[#101010] font-bold text-sm px-6 py-2.5">
                    {copied ? "✓ Link copiado" : "Copiar mi link"}
                  </motion.button>
                </>
              ) : (
                <>
                  <div className="text-3xl mb-3">🎉</div>
                  <p className="text-sm font-bold">¡Día completado!</p>
                  <p className="text-xs text-[#5A5A54] mt-1">Atendiste todos los turnos. Bien ahí.</p>
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
                    className="flex items-center gap-3 rounded-2xl bg-[#141414] border border-[#262626] px-4 py-3 mb-2">
                    <div className="w-6 h-6 rounded-full bg-[#181818] border border-[#262626] text-[#6E6E68] text-[10px] font-bold flex items-center justify-center shrink-0">{i + 2}</div>
                    <div className="font-mono text-sm font-bold w-11 text-[#D8F34E]">{a.time.slice(0, 5)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{a.client_name}</div>
                      <div className="text-[10px] text-[#5A5A54]">
                        {a.services?.name}
                        {barberName(a.barber_id) ? ` · ${barberName(a.barber_id)}` : ""} ·{" "}
                        <a href={waLink(a.client_phone)} target="_blank" rel="noopener noreferrer"
                          className="underline text-[#6E6E68] hover:text-[#D8F34E]">
                          💬 {a.client_phone}
                        </a>
                      </div>
                    </div>
                    <button onClick={() => openMove(a)} className="text-[#5A5A54] hover:text-[#D8F34E] text-sm px-1" title="Mover turno">🕐</button>
                    <button onClick={() => setStatus(a.id, "cancelled_by_shop")} className="text-[#5A5A54] hover:text-red-400 text-sm px-1" title="Cancelar turno">✕</button>
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
              <motion.div key={a.id} layout initial={{ opacity: 0 }} animate={{ opacity: 0.35 }}
                className="flex items-center gap-3 px-4 py-2">
                <span className="text-[#D8F34E] text-sm">✓</span>
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
            className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#141414] border-t border-[#262626] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold">Mover turno</h2>
                <button onClick={closeMove} className="text-[#5A5A54] text-lg leading-none px-1">✕</button>
              </div>
              <p className="text-xs text-[#6E6E68] mb-4">
                {moving.client_name} · {moving.services?.name} ({moving.services?.duration_min} min)
                {barberName(moving.barber_id) ? ` · con ${barberName(moving.barber_id)}` : ""}
              </p>

              {!schedInfo ? (
                <p className="text-sm text-[#5A5A54] py-6 text-center">Cargando horarios…</p>
              ) : (
                <>
                  {/* día destino */}
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                    {days.map((d) => {
                      const ds = fmtDate(d); const on = moveDate === ds; const closed = moveDayBlocked(ds);
                      return (
                        <button key={ds} disabled={closed} onClick={() => { setMoveDate(ds); setMoveTime(null); }}
                          className={`shrink-0 w-12 rounded-2xl border-[1.5px] py-2 text-center transition-colors ${
                            closed ? "border-[#1A1A1A] bg-[#111] opacity-30 cursor-not-allowed"
                              : on ? "border-[#D8F34E] bg-[#D8F34E]/10" : "border-[#262626] bg-[#181818]"}`}>
                          <div className={`text-[8px] uppercase ${on && !closed ? "text-[#D8F34E]" : "text-[#5A5A54]"}`}>{ds === today ? "Hoy" : DAYS_ES[d.getDay()]}</div>
                          <div className={`text-sm font-bold ${on ? "text-[#D8F34E]" : ""}`}>{d.getDate()}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* horarios libres */}
                  {moveSlots.grid.length === 0 ? (
                    <p className="text-sm text-[#5A5A54] py-4 text-center">
                      {moving.barber_id && absences.has(`${moving.barber_id}|${moveDate}`)
                        ? `${barberName(moving.barber_id)} no está ese día. Elegí otro.`
                        : "Cerrado ese día. Elegí otro."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {moveSlots.grid.map((s) => {
                        const free = moveSlots.availability[s]; const on = moveTime === s;
                        return (
                          <button key={s} disabled={!free} onClick={() => setMoveTime(s)}
                            className={`rounded-xl border-[1.5px] py-2 text-[11px] font-semibold transition-colors ${
                              !free ? "border-transparent bg-[#141414] text-[#3A3A36] line-through"
                                : on ? "border-[#D8F34E] bg-[#D8F34E] text-[#101010]"
                                : "border-[#262626] bg-[#181818] text-[#C9C9C4]"}`}>{s}</button>
                        );
                      })}
                    </div>
                  )}

                  {moveError && <p className="text-sm text-red-400 mb-3 text-center">{moveError}</p>}

                  <motion.button whileTap={{ scale: 0.97 }} onClick={confirmMove} disabled={!moveTime || moveSaving}
                    className="w-full rounded-full bg-[#D8F34E] text-[#101010] font-bold py-3.5 disabled:opacity-30">
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
  return <div className={`text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2 ${className}`}>{children}</div>;
}
