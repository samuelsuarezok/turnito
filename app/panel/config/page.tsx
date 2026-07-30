"use client";



import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

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

type Svc = { id?: string; name: string; duration_min: number; price: number; _deleted?: boolean };
type HourRange = { opens_at: string; closes_at: string };
type DayHours = { open: boolean; ranges: HourRange[] };
type Closed = { id: string; date: string; reason: string | null; from_time?: string | null; to_time?: string | null };
type Absence = { id: string; date: string };
// Barbero del local. `absences` son los días sueltos en que no está.
type Barber = { id?: string; name: string; absences: Absence[]; _deleted?: boolean };

const inputCls = "w-full rounded-2xl bg-[#181818] border border-[#262626] px-4 py-3 outline-none focus:border-[#D8F34E] transition-colors text-sm";
const selectCls = "rounded-xl bg-[#181818] border border-[#262626] px-2.5 py-1.5 text-xs outline-none";
const saveBtn = "rounded-full bg-[#D8F34E] text-[#101010] font-bold text-sm px-6 py-2.5 disabled:opacity-30";

function SectionCard({ title, children, onSave, saving, saved }: {
  title: string; children: React.ReactNode; onSave: () => void; saving: boolean; saved: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
      className="rounded-3xl bg-[#141414] border border-[#262626] p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold">{title}</h2>
        <motion.button whileTap={{ scale: 0.95 }} onClick={onSave} disabled={saving} className={saveBtn}>
          {saving ? "…" : saved ? "✓ Guardado" : "Guardar"}
        </motion.button>
      </div>
      {children}
    </motion.div>
  );
}

export default function ConfigPage() {
  const supabase = createClient();
  const router = useRouter();

  const [shopId, setShopId] = useState<string | null>(null);
  const [slug, setSlug] = useState("");

  // datos
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [minNotice, setMinNotice] = useState(60);
  const [cancelLimit, setCancelLimit] = useState(60);

  // servicios
  const [services, setServices] = useState<Svc[]>([]);

  // barberos
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [absenceDate, setAbsenceDate] = useState<Record<string, string>>({}); // por barbero
  const [confirmDelBarber, setConfirmDelBarber] = useState<number | null>(null);

  // horarios
  const [hours, setHours] = useState<Record<number, DayHours>>({});

  // días cerrados
  const [closedList, setClosedList] = useState<Closed[]>([]);
  const [newClosedDate, setNewClosedDate] = useState("");
  const [newClosedReason, setNewClosedReason] = useState("");
  const [closedPartial, setClosedPartial] = useState(false); // false = día completo
  const [newClosedFrom, setNewClosedFrom] = useState("");
  const [newClosedTo, setNewClosedTo] = useState("");

  const [savingKey, setSavingKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [error, setError] = useState("");

  function flash(key: string) {
    setSavedKey(key);
    setTimeout(() => setSavedKey(""), 2000);
  }

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return router.push("/login");

      const { data: shop } = await supabase
        .from("barbershops")
        .select("id, name, slug, whatsapp, slot_minutes, min_notice_min, cancel_limit_min")
        .maybeSingle();
      if (!shop) return router.push("/onboarding");

      setShopId(shop.id);
      setName(shop.name);
      setSlug(shop.slug);
      setWhatsapp(shop.whatsapp);
      setSlotMinutes(shop.slot_minutes);
      setMinNotice(shop.min_notice_min ?? 60);
      setCancelLimit(shop.cancel_limit_min ?? 60);

      const { data: svcs } = await supabase
        .from("services")
        .select("id, name, duration_min, price")
        .eq("barbershop_id", shop.id)
        .eq("active", true)
        .order("sort_order");
      setServices((svcs ?? []) as Svc[]);

      const { data: hrs } = await supabase
        .from("opening_hours")
        .select("weekday, opens_at, closes_at")
        .eq("barbershop_id", shop.id);
      const map: Record<number, DayHours> = {};
      for (const d of DAYS) {
        // Franjas partidas: agrupamos TODAS las filas del día (puede haber varias).
        const rows = (hrs ?? [])
          .filter((h) => h.weekday === d.weekday)
          .map((h) => ({ opens_at: h.opens_at.slice(0, 5), closes_at: h.closes_at.slice(0, 5) }))
          .sort((a, b) => a.opens_at.localeCompare(b.opens_at));
        map[d.weekday] = rows.length
          ? { open: true, ranges: rows }
          : { open: false, ranges: [{ opens_at: "09:00", closes_at: "19:00" }] };
      }
      setHours(map);

      await loadClosed(shop.id);
      await loadBarbers(shop.id);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dos queries en vez de un embed: no dependemos de que PostgREST tenga
  // la relación barbers→barber_absences en su cache de schema.
  async function loadBarbers(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: brs } = await supabase
      .from("barbers")
      .select("id, name")
      .eq("barbershop_id", id)
      .eq("active", true)
      .order("sort_order");

    const ids = (brs ?? []).map((b) => b.id as string);
    let abs: { id: string; barber_id: string; date: string }[] = [];
    if (ids.length > 0) {
      const { data } = await supabase
        .from("barber_absences")
        .select("id, barber_id, date")
        .in("barber_id", ids)
        .gte("date", today)
        .order("date");
      abs = (data ?? []) as typeof abs;
    }

    setBarbers(
      (brs ?? []).map((b) => ({
        id: b.id as string,
        name: b.name as string,
        absences: abs.filter((a) => a.barber_id === b.id).map((a) => ({ id: a.id, date: a.date })),
      }))
    );
  }

  async function loadClosed(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    // select("*") para traer from_time/to_time SI existen (retrocompat pre-migración).
    const { data } = await supabase
      .from("closed_dates")
      .select("*")
      .eq("barbershop_id", id)
      .gte("date", today)
      .order("date");
    setClosedList((data ?? []) as Closed[]);
  }

  // ── guardar datos ──
  async function saveShop() {
    if (!shopId) return;
    setError(""); setSavingKey("shop");
    const { error } = await supabase
      .from("barbershops")
      .update({
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        slot_minutes: slotMinutes,
        min_notice_min: minNotice,
        cancel_limit_min: cancelLimit,
      })
      .eq("id", shopId);
    setSavingKey("");
    if (error) return setError(error.message);
    flash("shop");
  }

  // ── guardar servicios ──
  async function saveServices() {
    if (!shopId) return;
    setError(""); setSavingKey("svc");

    for (let i = 0; i < services.length; i++) {
      const s = services[i];
      if (s._deleted && s.id) {
        await supabase.from("services").update({ active: false }).eq("id", s.id);
      } else if (!s._deleted && s.id) {
        await supabase.from("services")
          .update({ name: s.name.trim(), duration_min: s.duration_min, price: s.price, sort_order: i })
          .eq("id", s.id);
      } else if (!s._deleted && !s.id) {
        await supabase.from("services")
          .insert({ barbershop_id: shopId, name: s.name.trim(), duration_min: s.duration_min, price: s.price, sort_order: i });
      }
    }

    // recargar la lista limpia
    const { data: svcs } = await supabase
      .from("services").select("id, name, duration_min, price")
      .eq("barbershop_id", shopId).eq("active", true).order("sort_order");
    setServices((svcs ?? []) as Svc[]);

    setSavingKey("");
    flash("svc");
  }

  // ── guardar barberos ──
  // Baja lógica (active=false) igual que servicios: si borráramos la fila,
  // los turnos históricos perderían con quién fueron.
  async function saveBarbers() {
    if (!shopId) return;
    setError(""); setSavingKey("brb");

    for (let i = 0; i < barbers.length; i++) {
      const b = barbers[i];
      if (b._deleted && b.id) {
        await supabase.from("barbers").update({ active: false }).eq("id", b.id);
      } else if (!b._deleted && b.id) {
        await supabase.from("barbers").update({ name: b.name.trim(), sort_order: i }).eq("id", b.id);
      } else if (!b._deleted && b.name.trim()) {
        await supabase.from("barbers").insert({ barbershop_id: shopId, name: b.name.trim(), sort_order: i });
      }
    }

    await loadBarbers(shopId);
    setConfirmDelBarber(null);
    setSavingKey("");
    flash("brb");
  }

  // Las ausencias se guardan al toque (no esperan al botón Guardar):
  // sólo aplican a barberos que ya existen en la base.
  async function addAbsence(barberId: string) {
    const date = absenceDate[barberId];
    if (!shopId || !date) return;
    setError("");
    const { error } = await supabase.from("barber_absences").insert({ barber_id: barberId, date });
    if (error) {
      return setError(error.code === "23505" ? "Ese día ya estaba marcado para ese barbero." : error.message);
    }
    setAbsenceDate({ ...absenceDate, [barberId]: "" });
    await loadBarbers(shopId);
  }

  async function removeAbsence(absenceId: string) {
    if (!shopId) return;
    await supabase.from("barber_absences").delete().eq("id", absenceId);
    await loadBarbers(shopId);
  }

  // ── guardar horarios ──
  async function saveHours() {
    if (!shopId) return;
    setError(""); setSavingKey("hrs");

    await supabase.from("opening_hours").delete().eq("barbershop_id", shopId);
    // delete + insert de todo sigue igual; ahora insertamos 1 fila por CADA franja.
    const rows = DAYS.filter((d) => hours[d.weekday]?.open).flatMap((d) =>
      hours[d.weekday].ranges.map((r) => ({
        barbershop_id: shopId,
        weekday: d.weekday,
        opens_at: r.opens_at,
        closes_at: r.closes_at,
      }))
    );
    if (rows.length > 0) {
      const { error } = await supabase.from("opening_hours").insert(rows);
      if (error) { setSavingKey(""); return setError(error.message); }
    }
    setSavingKey("");
    flash("hrs");
  }

  // ── días cerrados ──
  async function addClosed() {
    if (!shopId || !newClosedDate) return;
    setError("");
    const payload: Record<string, unknown> = {
      barbershop_id: shopId,
      date: newClosedDate,
      reason: newClosedReason.trim() || null,
    };
    // Rango horario opcional. Sin rango = día completo (from/to quedan NULL).
    if (closedPartial && newClosedFrom && newClosedTo) {
      if (newClosedFrom >= newClosedTo) return setError("El horario 'desde' tiene que ser menor que 'hasta'.");
      payload.from_time = newClosedFrom;
      payload.to_time = newClosedTo;
    }
    const { error } = await supabase.from("closed_dates").insert(payload);
    if (error) {
      return setError(error.code === "23505" ? "Esa fecha ya está bloqueada." : error.message);
    }
    setNewClosedDate(""); setNewClosedReason(""); setNewClosedFrom(""); setNewClosedTo(""); setClosedPartial(false);
    await loadClosed(shopId);
  }

  async function removeClosed(id: string) {
    if (!shopId) return;
    await supabase.from("closed_dates").delete().eq("id", id);
    await loadClosed(shopId);
  }

  const visibleServices = services.filter((s) => !s._deleted);
  const visibleBarbers = barbers.filter((b) => !b._deleted);

  return (
    <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] p-5">
      {/* Toast de guardado — feedback bien visible arriba */}
      <AnimatePresence>
        {savedKey && (
          <motion.div
            initial={{ opacity: 0, y: 24, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: 24, x: "-50%" }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed bottom-6 left-1/2 z-50 flex items-center gap-2 rounded-full bg-[#D8F34E] text-[#101010] font-bold text-sm px-5 py-2.5 shadow-lg shadow-black/50">
            <span className="text-base leading-none">✓</span> Guardado
          </motion.div>
        )}
      </AnimatePresence>
      <div className="max-w-md mx-auto pb-16">
        {/* header */}
        <motion.div className="flex items-center justify-between pt-2 mb-6"
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div className="flex items-center gap-2.5">
            <LogoMark size={22} />
            <h1 className="text-lg font-bold">Configuración</h1>
          </div>
          <Link href="/panel" className="text-[11px] text-[#D8F34E] font-semibold">← Volver al panel</Link>
        </motion.div>

        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-red-400 mb-4">{error}</motion.p>
        )}

        {/* DATOS */}
        <SectionCard title="Datos del local" onSave={saveShop} saving={savingKey === "shop"} saved={savedKey === "shop"}>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mb-3`} />
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2">WhatsApp</label>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={`${inputCls} mb-3`} />
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2">Duración de cada turno</label>
          <div className="flex gap-2 mb-3">
            {[15, 30, 45, 60].map((m) => (
              <button key={m} onClick={() => setSlotMinutes(m)}
                className={`flex-1 rounded-full py-2 text-xs font-bold border transition-colors ${
                  slotMinutes === m ? "bg-[#D8F34E] text-[#101010] border-[#D8F34E]" : "bg-[#181818] text-[#6E6E68] border-[#262626]"
                }`}>{m} min</button>
            ))}
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2">Anticipación mínima</label>
              <select value={minNotice} onChange={(e) => setMinNotice(Number(e.target.value))}
                className="w-full rounded-xl bg-[#181818] border border-[#262626] px-3 py-2.5 text-sm outline-none">
                <option value={0}>Sin límite</option>
                <option value={30}>30 min antes</option>
                <option value={60}>1 hora antes</option>
                <option value={120}>2 horas antes</option>
                <option value={240}>4 horas antes</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2">Cancelar hasta</label>
              <select value={cancelLimit} onChange={(e) => setCancelLimit(Number(e.target.value))}
                className="w-full rounded-xl bg-[#181818] border border-[#262626] px-3 py-2.5 text-sm outline-none">
                <option value={0}>Sin límite</option>
                <option value={30}>30 min antes</option>
                <option value={60}>1 hora antes</option>
                <option value={120}>2 horas antes</option>
                <option value={1440}>1 día antes</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-[#5A5A54]">
            Tu link es <span className="font-mono text-[#6E6E68]">turnito.app/{slug}</span> y no se puede cambiar (para no romper los links que ya compartiste).
          </p>
        </SectionCard>

        {/* SERVICIOS */}
        <SectionCard title="Servicios" onSave={saveServices} saving={savingKey === "svc"} saved={savedKey === "svc"}>
          {visibleServices.map((svc) => {
            const realIndex = services.indexOf(svc);
            return (
              <div key={svc.id ?? `new-${realIndex}`} className="rounded-2xl bg-[#181818] border border-[#262626] p-3 mb-2">
                <div className="flex gap-2 mb-2">
                  <input value={svc.name} placeholder="Nombre"
                    onChange={(e) => setServices(services.map((s, j) => (j === realIndex ? { ...s, name: e.target.value } : s)))}
                    className="flex-1 rounded-xl bg-[#141414] border border-[#262626] px-3 py-2 text-sm outline-none focus:border-[#D8F34E]" />
                  {visibleServices.length > 1 && (
                    <button onClick={() => setServices(services.map((s, j) => (j === realIndex ? { ...s, _deleted: true } : s)))}
                      className="text-red-400 px-2">✕</button>
                  )}
                </div>
                <div className="flex gap-2">
                  <select value={svc.duration_min}
                    onChange={(e) => setServices(services.map((s, j) => (j === realIndex ? { ...s, duration_min: Number(e.target.value) } : s)))}
                    className={`${selectCls} flex-1 py-2`}>
                    {[15, 20, 30, 45, 60, 90].map((d) => (<option key={d} value={d}>{d} min</option>))}
                  </select>
                  <input type="number" value={svc.price || ""} placeholder="Precio"
                    onChange={(e) => setServices(services.map((s, j) => (j === realIndex ? { ...s, price: Number(e.target.value) } : s)))}
                    className="flex-1 rounded-xl bg-[#141414] border border-[#262626] px-3 py-2 text-sm outline-none focus:border-[#D8F34E]" />
                </div>
              </div>
            );
          })}
          <button onClick={() => setServices([...services, { name: "", duration_min: 30, price: 0 }])}
            className="w-full rounded-2xl border border-dashed border-[#333] py-3 text-sm text-[#D8F34E] font-semibold">
            + Agregar servicio
          </button>
        </SectionCard>

        {/* BARBEROS */}
        <SectionCard title="Barberos" onSave={saveBarbers} saving={savingKey === "brb"} saved={savedKey === "brb"}>
          <p className="text-[11px] text-[#5A5A54] mb-4">
            {visibleBarbers.length === 0
              ? "Si trabajás solo, dejá esto vacío y todo sigue igual. Si sos más de uno, cargá a cada barbero: el cliente va a poder elegir con quién cortarse."
              : "Cada barbero tiene su propia agenda. Marcá los días que alguno no está y esos días no va a recibir turnos."}
          </p>

          {visibleBarbers.map((brb) => {
            const realIndex = barbers.indexOf(brb);
            return (
              <div key={brb.id ?? `new-${realIndex}`} className="rounded-2xl bg-[#181818] border border-[#262626] p-3 mb-2">
                <div className="flex gap-2">
                  <input value={brb.name} placeholder="Nombre del barbero"
                    onChange={(e) => setBarbers(barbers.map((b, j) => (j === realIndex ? { ...b, name: e.target.value } : b)))}
                    className="flex-1 rounded-xl bg-[#141414] border border-[#262626] px-3 py-2 text-sm outline-none focus:border-[#D8F34E]" />
                  <button onClick={() => setConfirmDelBarber(confirmDelBarber === realIndex ? null : realIndex)}
                    className="text-red-400 px-2" title="Eliminar barbero">✕</button>
                </div>

                {/* Eliminar = ya no trabaja más acá. Pedimos confirmación porque
                    se lleva puesta su disponibilidad futura. */}
                {confirmDelBarber === realIndex && (
                  <div className="mt-2 rounded-xl border border-red-900/50 bg-red-950/20 p-2.5">
                    <p className="text-[11px] text-[#C9C9C4] mb-2">
                      ¿Eliminar a {brb.name.trim() || "este barbero"}? Se saca de la lista y deja de recibir turnos.
                      Los turnos que ya tenía no se borran.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmDelBarber(null)}
                        className="flex-1 rounded-full border border-[#333] text-[11px] font-bold py-1.5">No</button>
                      <button onClick={() => {
                        setBarbers(barbers.map((b, j) => (j === realIndex ? { ...b, _deleted: true } : b)));
                        setConfirmDelBarber(null);
                      }} className="flex-1 rounded-full bg-red-900/40 border border-red-900/50 text-red-300 text-[11px] font-bold py-1.5">
                        Sí, eliminar
                      </button>
                    </div>
                  </div>
                )}

                {/* Ausencias: sólo tienen sentido sobre un barbero ya guardado. */}
                {brb.id ? (
                  <div className="mt-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-1.5">Días que no está</div>
                    <div className="flex gap-2 mb-2">
                      <input type="date" value={absenceDate[brb.id] ?? ""} min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setAbsenceDate({ ...absenceDate, [brb.id!]: e.target.value })}
                        className="flex-1 rounded-xl bg-[#141414] border border-[#262626] px-3 py-2 text-sm outline-none focus:border-[#D8F34E] [color-scheme:dark]" />
                      <button onClick={() => addAbsence(brb.id!)} disabled={!absenceDate[brb.id]}
                        className="rounded-full bg-[#D8F34E] text-[#101010] font-bold text-[11px] px-4 disabled:opacity-30">
                        Marcar
                      </button>
                    </div>
                    {brb.absences.length === 0 ? (
                      <p className="text-[11px] text-[#5A5A54]">Trabaja todos los días abiertos del local.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {brb.absences.map((a) => (
                          <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-[#141414] border border-[#262626] pl-2.5 pr-1.5 py-1">
                            <span className="font-mono text-[11px] text-[#D8F34E]">{a.date}</span>
                            <button onClick={() => removeAbsence(a.id)} className="text-[#5A5A54] hover:text-red-400 text-xs leading-none">✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-[#5A5A54] mt-2">Guardá para poder marcarle días libres.</p>
                )}
              </div>
            );
          })}

          <button onClick={() => setBarbers([...barbers, { name: "", absences: [] }])}
            className="w-full rounded-2xl border border-dashed border-[#333] py-3 text-sm text-[#D8F34E] font-semibold">
            + Agregar barbero
          </button>
        </SectionCard>

        {/* HORARIOS */}
        <SectionCard title="Horarios" onSave={saveHours} saving={savingKey === "hrs"} saved={savedKey === "hrs"}>
          {DAYS.map((d) => {
            const h = hours[d.weekday];
            if (!h) return null;
            const setDay = (patch: Partial<DayHours>) => setHours({ ...hours, [d.weekday]: { ...h, ...patch } });
            const setRange = (i: number, patch: Partial<HourRange>) =>
              setDay({ ranges: h.ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
            return (
              <div key={d.weekday}
                className={`rounded-2xl bg-[#181818] border border-[#262626] px-3 py-2.5 mb-2 ${h.open ? "" : "opacity-40"}`}>
                <div className="flex items-center gap-3">
                  <button onClick={() => setDay({ open: !h.open })}
                    className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${h.open ? "bg-[#D8F34E]" : "bg-[#2A2A2A]"}`}>
                    <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full transition-all ${h.open ? "left-[20px] bg-[#101010]" : "left-[3px] bg-[#5A5A54]"}`} />
                  </button>
                  <span className="text-xs font-semibold">{d.label}</span>
                  {!h.open && <span className="ml-auto text-[11px] text-[#5A5A54]">Cerrado</span>}
                </div>

                {h.open && (
                  <div className="mt-2 pl-12 flex flex-col gap-1.5">
                    {h.ranges.map((r, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <select value={r.opens_at} onChange={(e) => setRange(i, { opens_at: e.target.value })} className={selectCls}>
                          {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                        </select>
                        <span className="text-[10px] text-[#5A5A54]">a</span>
                        <select value={r.closes_at} onChange={(e) => setRange(i, { closes_at: e.target.value })} className={selectCls}>
                          {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                        </select>
                        {h.ranges.length > 1 && (
                          <button onClick={() => setDay({ ranges: h.ranges.filter((_, j) => j !== i) })}
                            className="text-[#5A5A54] hover:text-red-400 text-sm px-1" title="Quitar franja">✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setDay({ ranges: [...h.ranges, { opens_at: "16:00", closes_at: "20:00" }] })}
                      className="text-[11px] text-[#D8F34E] font-semibold text-left mt-0.5">
                      + Agregar franja (ej: tarde)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </SectionCard>

        {/* DÍAS CERRADOS */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
          className="rounded-3xl bg-[#141414] border border-[#262626] p-5 mb-4">
          <h2 className="text-base font-bold mb-1">Días cerrados</h2>
          <p className="text-[11px] text-[#5A5A54] mb-4">Feriados, vacaciones, turnos médicos. Esos días nadie va a poder reservar.</p>

          <div className="flex gap-2 mb-2">
            <input type="date" value={newClosedDate} min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setNewClosedDate(e.target.value)}
              className="rounded-xl bg-[#181818] border border-[#262626] px-3 py-2 text-sm outline-none focus:border-[#D8F34E] [color-scheme:dark]" />
            <input value={newClosedReason} onChange={(e) => setNewClosedReason(e.target.value)} placeholder="Motivo (opcional)"
              className="flex-1 rounded-xl bg-[#181818] border border-[#262626] px-3 py-2 text-sm outline-none focus:border-[#D8F34E]" />
          </div>

          {/* Día completo vs rango horario puntual (ej: "médico 15-17") */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setClosedPartial(false)}
              className={`flex-1 rounded-full py-1.5 text-[11px] font-bold border transition-colors ${!closedPartial ? "bg-[#D8F34E] text-[#101010] border-[#D8F34E]" : "bg-[#181818] text-[#6E6E68] border-[#262626]"}`}>
              Todo el día
            </button>
            <button onClick={() => setClosedPartial(true)}
              className={`flex-1 rounded-full py-1.5 text-[11px] font-bold border transition-colors ${closedPartial ? "bg-[#D8F34E] text-[#101010] border-[#D8F34E]" : "bg-[#181818] text-[#6E6E68] border-[#262626]"}`}>
              Solo un rango
            </button>
          </div>
          {closedPartial && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[11px] text-[#5A5A54]">de</span>
              <select value={newClosedFrom} onChange={(e) => setNewClosedFrom(e.target.value)} className={selectCls}>
                <option value="">--</option>
                {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
              </select>
              <span className="text-[11px] text-[#5A5A54]">a</span>
              <select value={newClosedTo} onChange={(e) => setNewClosedTo(e.target.value)} className={selectCls}>
                <option value="">--</option>
                {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
              </select>
            </div>
          )}
          <motion.button whileTap={{ scale: 0.96 }} onClick={addClosed}
            disabled={!newClosedDate || (closedPartial && (!newClosedFrom || !newClosedTo))}
            className="w-full rounded-full bg-[#D8F34E] text-[#101010] font-bold text-sm py-2.5 disabled:opacity-30 mb-4">
            {closedPartial ? "Bloquear rango" : "Bloquear fecha"}
          </motion.button>

          {closedList.length === 0 ? (
            <p className="text-[11px] text-[#5A5A54] text-center py-2">No hay fechas bloqueadas próximas.</p>
          ) : (
            closedList.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 rounded-2xl bg-[#181818] border border-[#262626] px-4 py-2.5 mb-2">
                <span className="font-mono text-sm font-bold text-[#D8F34E]">{c.date}</span>
                {c.from_time && (
                  <span className="font-mono text-[10px] text-[#D8F34E] bg-[#D8F34E]/10 rounded px-1.5 py-0.5 shrink-0">
                    {c.from_time.slice(0, 5)}–{c.to_time?.slice(0, 5)}
                  </span>
                )}
                <span className="flex-1 text-xs text-[#6E6E68] truncate">{c.reason ?? (c.from_time ? "Rango bloqueado" : "Cerrado")}</span>
                <button onClick={() => removeClosed(c.id)} className="text-[#5A5A54] hover:text-red-400 text-sm">✕</button>
              </div>
            ))
          )}
        </motion.div>
      </div>
    </main>
  );
}
