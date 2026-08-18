"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { SITE_DOMAIN, slugify } from "@/lib/site";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import {
  RUBROS_LISTA,
  EQUIPO,
  DURACION_OPTS,
  formatDuracion,
  getRubro,
  type RubroId,
} from "@/lib/rubros";

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

// booking_mode: "agenda" = el cliente reserva. "consulta" = no reserva, se lo
// manda al WhatsApp de quien lo hace. Ver 0010_servicios_por_consulta.sql.
// `_aConsultar` es estado de EDICIÓN, no va a la base (igual que `_deleted`).
//
// En la base "a consultar" se guarda como price = 0, y eso está bien. El
// problema era usar esa misma regla mientras se escribe: `Number("")` es 0, así
// que borrar el campo para corregir un precio se interpretaba como "elegí no
// poner precio", se marcaba el checkbox solo y el input quedaba deshabilitado a
// mitad de tipear. Una clienta lo reportó y tenía razón.
//
// Separando las dos cosas, el campo vacío es sólo un campo vacío.
type Svc = {
  id?: string; name: string; duration_min: number; price: number;
  booking_mode: "agenda" | "consulta"; _deleted?: boolean; _aConsultar?: boolean;
};
type HourRange = { opens_at: string; closes_at: string };
type DayHours = { open: boolean; ranges: HourRange[] };
type Closed = { id: string; date: string; reason: string | null; from_time?: string | null; to_time?: string | null };
type Absence = { id: string; date: string };
// Persona del equipo. `absences` son los días sueltos en que no está.
// `service_ids`: qué servicios hace. VACÍO SIGNIFICA TODOS, igual que en la
// base — ver 0009_servicios_por_persona.sql. No es "no hace nada".
type StaffMember = {
  id?: string; name: string; whatsapp: string; absences: Absence[]; service_ids: string[];
  _deleted?: boolean;
};

const inputCls = "w-full rounded-2xl bg-surface border border-line px-4 py-3 outline-none focus:border-accent transition-colors text-base";
const selectCls = "rounded-xl bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent";
const saveBtn = "rounded-full bg-accent text-on-accent font-bold text-base px-6 py-2.5 disabled:opacity-25 transition-opacity";
const miniLabel = "block text-[12px] font-bold uppercase tracking-widest text-faint mb-2";

function SectionCard({ title, children, onSave, saving, saved }: {
  title: string; children: React.ReactNode; onSave: () => void; saving: boolean; saved: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
      className="rounded-3xl bg-surface border border-line p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-extrabold text-ink">{title}</h2>
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
  const [businessType, setBusinessType] = useState<RubroId>("otro");

  // servicios
  const [services, setServices] = useState<Svc[]>([]);

  // equipo
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [absenceDate, setAbsenceDate] = useState<Record<string, string>>({}); // por persona
  const [confirmDelStaff, setConfirmDelStaff] = useState<number | null>(null);

  // horarios
  const [hours, setHours] = useState<Record<number, DayHours>>({});

  // días cerrados
  const [closedList, setClosedList] = useState<Closed[]>([]);
  const [newClosedDate, setNewClosedDate] = useState("");
  const [newClosedReason, setNewClosedReason] = useState("");
  const [closedPartial, setClosedPartial] = useState(false); // false = día completo
  const [newClosedFrom, setNewClosedFrom] = useState("");
  const [newClosedTo, setNewClosedTo] = useState("");

  // Cambiar el link del local (ver 0012_cambiar_slug.sql)
  const [editandoSlug, setEditandoSlug] = useState(false);
  const [nuevoSlug, setNuevoSlug] = useState("");
  const [slugMsg, setSlugMsg] = useState("");
  const [slugOk, setSlugOk] = useState(false);

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
        .from("businesses")
        .select("id, name, slug, whatsapp, slot_minutes, min_notice_min, cancel_limit_min, business_type")
        .maybeSingle();
      if (!shop) return router.push("/onboarding");

      setShopId(shop.id);
      setName(shop.name);
      setSlug(shop.slug);
      setWhatsapp(shop.whatsapp);
      setSlotMinutes(shop.slot_minutes);
      setMinNotice(shop.min_notice_min ?? 60);
      setCancelLimit(shop.cancel_limit_min ?? 60);
      // getRubro nunca explota: si la migración de rubros todavía no corrió,
      // la columna viene undefined y cae en "otro".
      setBusinessType(getRubro(shop.business_type).id);

      const { data: svcs } = await supabase
        .from("services")
        .select("id, name, duration_min, price, booking_mode")
        .eq("business_id", shop.id)
        .eq("active", true)
        .order("sort_order");
      // price 0 en la base = a consultar. Se traduce UNA vez, al cargar.
      setServices((svcs ?? []).map((x) => ({ ...x, _aConsultar: x.price === 0 })) as Svc[]);

      const { data: hrs } = await supabase
        .from("opening_hours")
        .select("weekday, opens_at, closes_at")
        .eq("business_id", shop.id);
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
      await loadStaff(shop.id);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dos queries en vez de un embed: no dependemos de que PostgREST tenga
  // la relación staff→staff_absences en su cache de schema.
  async function loadStaff(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: brs } = await supabase
      .from("staff")
      .select("id, name, whatsapp")
      .eq("business_id", id)
      .eq("active", true)
      .order("sort_order");

    const ids = (brs ?? []).map((b) => b.id as string);
    let abs: { id: string; staff_id: string; date: string }[] = [];
    let asign: { service_id: string; staff_id: string }[] = [];
    if (ids.length > 0) {
      const { data } = await supabase
        .from("staff_absences")
        .select("id, staff_id, date")
        .in("staff_id", ids)
        .gte("date", today)
        .order("date");
      abs = (data ?? []) as typeof abs;

      const { data: ss } = await supabase
        .from("service_staff")
        .select("service_id, staff_id")
        .in("staff_id", ids);
      asign = (ss ?? []) as typeof asign;
    }

    setStaff(
      (brs ?? []).map((b) => ({
        id: b.id as string,
        name: b.name as string,
        whatsapp: (b.whatsapp as string | null) ?? "",
        absences: abs.filter((a) => a.staff_id === b.id).map((a) => ({ id: a.id, date: a.date })),
        service_ids: asign.filter((a) => a.staff_id === b.id).map((a) => a.service_id),
      }))
    );
  }

  async function loadClosed(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    // select("*") para traer from_time/to_time SI existen (retrocompat pre-migración).
    const { data } = await supabase
      .from("closed_dates")
      .select("*")
      .eq("business_id", id)
      .gte("date", today)
      .order("date");
    setClosedList((data ?? []) as Closed[]);
  }

  // ── guardar datos ──
  // La validación de disponibilidad la hace la base, no acá: desde el cliente,
  // la RLS de `businesses` sólo deja ver el propio local, así que un slug
  // ocupado por otro se vería libre. La función cambiar_slug() mira todos y
  // hace el cambio en la misma transacción que guarda la redirección.
  async function guardarSlug() {
    if (!shopId || nuevoSlug === slug) return;
    setSavingKey("slug"); setSlugMsg(""); setSlugOk(false);

    const { data, error: e } = await supabase.rpc("cambiar_slug", { nuevo: nuevoSlug });
    setSavingKey("");

    if (e) {
      console.error("cambiar_slug:", e.code, e.message);
      return setSlugMsg(
        e.code === "PGRST202"
          ? "Todavía no está habilitado en la base. Falta correr la migración 0012_cambiar_slug.sql."
          : "No pudimos cambiar el link. Probá de nuevo."
      );
    }

    const r = data as { ok: boolean; error?: string; slug?: string };
    if (!r.ok) {
      const motivos: Record<string, string> = {
        OCUPADO: "Ese link ya lo está usando otro negocio. Probá con otro.",
        RESERVADO: "Esa palabra la usa Turnito para sus propias páginas. Elegí otra.",
        FORMATO: "Sólo letras, números y guiones, hasta 30 caracteres.",
        SIN_NEGOCIO: "No encontramos tu local. Recargá la página.",
      };
      return setSlugMsg(motivos[r.error ?? ""] ?? "No pudimos cambiar el link.");
    }

    setSlug(r.slug!);
    setSlugOk(true);
    setSlugMsg(`Listo: tu link ahora es ${SITE_DOMAIN}/${r.slug}`);
    setTimeout(() => setEditandoSlug(false), 1600);
  }

  async function saveShop() {
    if (!shopId) return;
    setError(""); setSavingKey("shop");
    const { error } = await supabase
      .from("businesses")
      .update({
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        slot_minutes: slotMinutes,
        min_notice_min: minNotice,
        cancel_limit_min: cancelLimit,
        business_type: businessType,
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
          .update({ name: s.name.trim(), duration_min: s.duration_min, price: s.price, booking_mode: s.booking_mode, sort_order: i })
          .eq("id", s.id);
      } else if (!s._deleted && !s.id) {
        await supabase.from("services")
          .insert({ business_id: shopId, name: s.name.trim(), duration_min: s.duration_min, price: s.price, booking_mode: s.booking_mode, sort_order: i });
      }
    }

    // recargar la lista limpia
    const { data: svcs } = await supabase
      .from("services").select("id, name, duration_min, price, booking_mode")
      .eq("business_id", shopId).eq("active", true).order("sort_order");
    // price 0 en la base = a consultar. Se traduce UNA vez, al cargar.
      setServices((svcs ?? []).map((x) => ({ ...x, _aConsultar: x.price === 0 })) as Svc[]);

    // Los chips de "quién lo hace" viven en esta sección pero escriben la misma
    // relación que Equipo. Sin esto, tocarlos acá y apretar Guardar no guardaría
    // nada y habría que ir a apretar el otro botón, que no lo adivina nadie.
    for (const b of staff) {
      if (b.id && !b._deleted) await syncServicios(b.id, b.service_ids);
    }

    setSavingKey("");
    flash("svc");
  }

  // ── guardar equipo ──
  // Baja lógica (active=false) igual que servicios: si borráramos la fila,
  // los turnos históricos perderían con quién fueron.
  // Deja service_staff igual a lo que quedó tildado para esa persona: borra lo
  // que sacó y agrega lo que sumó. Se hace por diferencia y no borrando todo
  // para reinsertarlo, así una reserva concurrente no encuentra a la persona
  // sin ningún servicio por una milésima.
  async function syncServicios(staffId: string, quiere: string[]) {
    const { data: actuales } = await supabase
      .from("service_staff")
      .select("service_id")
      .eq("staff_id", staffId);

    const tiene = (actuales ?? []).map((r) => r.service_id as string);
    const sumar = quiere.filter((id) => !tiene.includes(id));
    const sacar = tiene.filter((id) => !quiere.includes(id));

    if (sacar.length > 0) {
      await supabase.from("service_staff").delete().eq("staff_id", staffId).in("service_id", sacar);
    }
    if (sumar.length > 0) {
      await supabase
        .from("service_staff")
        .insert(sumar.map((service_id) => ({ service_id, staff_id: staffId })));
    }
  }

  async function saveStaff() {
    if (!shopId) return;
    setError(""); setSavingKey("brb");

    for (let i = 0; i < staff.length; i++) {
      const b = staff[i];
      if (b._deleted && b.id) {
        await supabase.from("staff").update({ active: false }).eq("id", b.id);
        continue;
      }
      if (!b._deleted && b.id) {
        await supabase
          .from("staff")
          .update({ name: b.name.trim(), whatsapp: b.whatsapp.trim() || null, sort_order: i })
          .eq("id", b.id);
        await syncServicios(b.id, b.service_ids);
      } else if (!b._deleted && b.name.trim()) {
        // Hace falta el id de vuelta: sin él no se puede vincular a los
        // servicios que se le tildaron antes de existir en la base.
        const { data: nuevo } = await supabase
          .from("staff")
          .insert({
            business_id: shopId, name: b.name.trim(),
            whatsapp: b.whatsapp.trim() || null, sort_order: i,
          })
          .select("id")
          .single();
        if (nuevo?.id) await syncServicios(nuevo.id as string, b.service_ids);
      }
    }

    await loadStaff(shopId);
    setConfirmDelStaff(null);
    setSavingKey("");
    flash("brb");
  }

  // Las ausencias se guardan al toque (no esperan al botón Guardar):
  // sólo aplican a personas que ya existen en la base.
  async function addAbsence(staffId: string) {
    const date = absenceDate[staffId];
    if (!shopId || !date) return;
    setError("");
    const { error } = await supabase.from("staff_absences").insert({ staff_id: staffId, date });
    if (error) {
      return setError(error.code === "23505" ? "Ese día ya estaba marcado para esa persona." : error.message);
    }
    setAbsenceDate({ ...absenceDate, [staffId]: "" });
    await loadStaff(shopId);
  }

  async function removeAbsence(absenceId: string) {
    if (!shopId) return;
    await supabase.from("staff_absences").delete().eq("id", absenceId);
    await loadStaff(shopId);
  }

  // ── guardar horarios ──
  async function saveHours() {
    if (!shopId) return;
    setError(""); setSavingKey("hrs");

    await supabase.from("opening_hours").delete().eq("business_id", shopId);
    // delete + insert de todo sigue igual; insertamos 1 fila por CADA franja.
    const rows = DAYS.filter((d) => hours[d.weekday]?.open).flatMap((d) =>
      hours[d.weekday].ranges.map((r) => ({
        business_id: shopId,
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
      business_id: shopId,
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
  const visibleStaff = staff.filter((b) => !b._deleted);

  return (
    <main className="min-h-screen bg-canvas text-body p-5">
      {/* Toast de guardado — feedback bien visible abajo */}
      <AnimatePresence>
        {savedKey && (
          <motion.div
            initial={{ opacity: 0, y: 24, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: 24, x: "-50%" }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed bottom-6 left-1/2 z-50 flex items-center gap-2 rounded-full bg-highlight text-on-highlight font-bold text-base px-5 py-2.5 shadow-lg shadow-black/15">
            <span className="text-lg leading-none">✓</span> Guardado
          </motion.div>
        )}
      </AnimatePresence>
      <div className="max-w-md lg:max-w-5xl mx-auto pb-16">
        {/* header */}
        <motion.div className="flex items-center justify-between pt-2 mb-6"
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div className="flex items-center gap-2.5">
            <LogoMark size={22} />
            <h1 className="text-xl font-extrabold text-ink tracking-tight">Configuración</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/panel" className="text-[13px] text-accent-ink font-bold">← Volver al panel</Link>
          </div>
        </motion.div>

        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-base text-danger mb-4">{error}</motion.p>
        )}

        {/* Dos columnas desde lg. Las tarjetas son independientes entre si,
            asi que columnas de altura despareja no molestan: cada una arranca
            arriba y crece lo que necesite. */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-x-5 lg:items-start">

        {/* DATOS */}
        <SectionCard title="Datos del local" onSave={saveShop} saving={savingKey === "shop"} saved={savedKey === "shop"}>
          <label className={miniLabel}>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mb-3`} />

          <label className={miniLabel}>A qué te dedicás</label>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {RUBROS_LISTA.map((r) => (
              <button key={r.id} onClick={() => setBusinessType(r.id)}
                className={`rounded-xl border-[1.5px] py-2 px-1 text-[13px] font-bold transition-colors ${
                  businessType === r.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-muted"
                }`}>
                <span className="block text-lg leading-tight mb-0.5">{r.emoji}</span>
                {r.label}
              </button>
            ))}
          </div>

          <label className={miniLabel}>WhatsApp</label>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={`${inputCls} mb-3`} />

          <label className={miniLabel}>Cada cuánto arranca un turno</label>
          <div className="flex gap-2 mb-1">
            {[15, 30, 45, 60].map((m) => (
              <button key={m} onClick={() => setSlotMinutes(m)}
                className={`flex-1 rounded-full py-2 text-sm font-bold border transition-colors ${
                  slotMinutes === m ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"
                }`}>{m} min</button>
            ))}
          </div>
          <p className="text-[13px] text-faint mb-3">
            Es la grilla que ve tu cliente, no la duración del servicio.
          </p>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className={miniLabel}>Anticipación mínima</label>
              <select value={minNotice} onChange={(e) => setMinNotice(Number(e.target.value))}
                className="w-full rounded-xl bg-surface border border-line px-3 py-2.5 text-base outline-none focus:border-accent">
                <option value={0}>Sin límite</option>
                <option value={30}>30 min antes</option>
                <option value={60}>1 hora antes</option>
                <option value={120}>2 horas antes</option>
                <option value={240}>4 horas antes</option>
              </select>
            </div>
            <div className="flex-1">
              <label className={miniLabel}>Cancelar hasta</label>
              <select value={cancelLimit} onChange={(e) => setCancelLimit(Number(e.target.value))}
                className="w-full rounded-xl bg-surface border border-line px-3 py-2.5 text-base outline-none focus:border-accent">
                <option value={0}>Sin límite</option>
                <option value={30}>30 min antes</option>
                <option value={60}>1 hora antes</option>
                <option value={120}>2 horas antes</option>
                <option value={1440}>1 día antes</option>
              </select>
            </div>
          </div>
          {/* El link. Se puede cambiar, pero está cerrado por defecto: es una
              decisión de una vez cada mucho, no un campo más del formulario. */}
          {!editandoSlug ? (
            <p className="text-[13px] text-faint">
              Tu link es <span className="font-mono text-muted">{SITE_DOMAIN}/{slug}</span>.{" "}
              <button onClick={() => { setEditandoSlug(true); setNuevoSlug(slug); setSlugMsg(""); }}
                className="text-accent-ink font-bold underline underline-offset-2">
                Cambiarlo
              </button>
            </p>
          ) : (
            <div className="rounded-2xl bg-surface-2 border border-line p-3.5">
              <label className={miniLabel}>Tu link</label>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[15px] font-mono text-faint shrink-0">{SITE_DOMAIN}/</span>
                <input value={nuevoSlug} inputMode="url" autoCapitalize="off" spellCheck={false}
                  onChange={(e) => { setNuevoSlug(slugify(e.target.value)); setSlugMsg(""); }}
                  className="flex-1 min-w-0 rounded-xl bg-surface border border-line px-3 py-2 text-[15px] font-mono outline-none focus:border-accent" />
              </div>
              <p className="text-[13px] text-faint leading-relaxed mb-3">
                El link de ahora, <span className="font-mono">{slug}</span>, va a seguir funcionando:
                a quien entre por ahí lo mandamos solo a la dirección nueva. Nadie se queda afuera.
              </p>
              {slugMsg && (
                <p className={`text-[13px] mb-2.5 ${slugOk ? "text-accent-ink" : "text-danger"}`}>{slugMsg}</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setEditandoSlug(false)}
                  className="flex-1 rounded-full border border-line bg-surface text-[13px] font-bold py-2">
                  Cancelar
                </button>
                <button onClick={guardarSlug} disabled={savingKey === "slug" || nuevoSlug === slug || !nuevoSlug}
                  className="flex-1 rounded-full bg-accent text-on-accent text-[13px] font-bold py-2 disabled:opacity-30">
                  {savingKey === "slug" ? "Guardando…" : "Cambiar el link"}
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* SERVICIOS */}
        <SectionCard title="Servicios" onSave={saveServices} saving={savingKey === "svc"} saved={savedKey === "svc"}>
          {visibleServices.map((svc) => {
            const realIndex = services.indexOf(svc);
            // Lo que decidió el dueño, no lo que quedó en el campo mientras escribe.
            const aConsultar = !!svc._aConsultar;
            // Campo vacío sin haber elegido "a consultar": se va a publicar como
            // "a consultar" igual, así que se avisa en vez de sorprender después.
            const vacioSinElegir = !aConsultar && !svc.price;
            return (
              <div key={svc.id ?? `new-${realIndex}`} className="rounded-2xl bg-surface-2 border border-line p-3 mb-2">
                <div className="flex gap-2 mb-2">
                  <input value={svc.name} placeholder="Nombre"
                    onChange={(e) => setServices(services.map((s, j) => (j === realIndex ? { ...s, name: e.target.value } : s)))}
                    className="flex-1 rounded-xl bg-surface border border-line px-3 py-2 text-base outline-none focus:border-accent" />
                  {visibleServices.length > 1 && (
                    <button onClick={() => setServices(services.map((s, j) => (j === realIndex ? { ...s, _deleted: true } : s)))}
                      className="text-danger px-2">✕</button>
                  )}
                </div>
                <div className="flex gap-2">
                  <select value={svc.duration_min}
                    onChange={(e) => setServices(services.map((s, j) => (j === realIndex ? { ...s, duration_min: Number(e.target.value) } : s)))}
                    className={`${selectCls} flex-1 py-2`}>
                    {DURACION_OPTS.map((d) => (<option key={d} value={d}>{formatDuracion(d)}</option>))}
                  </select>
                  <input type="number" inputMode="numeric" min={0}
                    value={svc.price || ""} placeholder={aConsultar ? "A consultar" : "Precio"} disabled={aConsultar}
                    onChange={(e) => setServices(services.map((s, j) => (j === realIndex ? { ...s, price: Number(e.target.value) } : s)))}
                    className="flex-1 rounded-xl bg-surface border border-line px-3 py-2 text-base outline-none focus:border-accent disabled:text-faint disabled:italic" />
                </div>
                <label className="flex items-center gap-2 mt-2 text-[13px] text-muted cursor-pointer select-none">
                  {/* Al destildar NO se rellena con un número inventado: se deja
                      el campo vacío y listo para escribir. Antes ponía 1000 y
                      había que borrarlo primero. */}
                  <input type="checkbox" checked={aConsultar}
                    onChange={(e) => setServices(services.map((s, j) => (j === realIndex
                      ? { ...s, _aConsultar: e.target.checked, price: 0 } : s)))}
                    className="accent-[var(--c-accent)] w-3.5 h-3.5" />
                  Sin precio fijo — mostrar &quot;a consultar&quot;
                </label>
                {vacioSinElegir && (
                  <p className="text-[12px] text-faint mt-1 leading-relaxed">
                    Sin precio se va a mostrar como &quot;a consultar&quot;.
                  </p>
                )}
                {/* Modo consulta: el cliente no reserva, se va al WhatsApp de
                    quien hace el servicio. Pensado para trabajos que se
                    conversan antes (un tatuaje, una extensión larga). */}
                <label className="flex items-center gap-2 mt-1.5 text-[13px] text-muted cursor-pointer select-none">
                  <input type="checkbox" checked={svc.booking_mode === "consulta"}
                    onChange={(e) => setServices(services.map((s, j) => (j === realIndex
                      ? { ...s, booking_mode: e.target.checked ? "consulta" : "agenda" } : s)))}
                    className="accent-[var(--c-accent)] w-3.5 h-3.5" />
                  Se coordina por WhatsApp — sin turno online
                </label>
                {svc.booking_mode === "consulta" && (
                  <p className="text-[12px] text-faint mt-1.5 leading-relaxed">
                    El cliente no elige día ni hora: lo mandamos al WhatsApp de quien lo hace.
                    Cuando cierren, cargá el turno vos desde la agenda.
                  </p>
                )}

                {/* Quién lo hace. Es la MISMA relación que se edita en Equipo,
                    leída al revés: armando un local uno piensa "el piercing lo
                    hace Juan", no "Juan hace piercing". Las dos vistas comparten
                    el estado, así que se mantienen solas en sincronía. */}
                {svc.id && visibleStaff.length > 1 && (() => {
                  const lohacen = visibleStaff.filter((b) => b.service_ids.includes(svc.id!));
                  return (
                    <div className="mt-2.5 pt-2.5 border-t border-line">
                      <div className="text-[13px] text-faint mb-1.5">
                        {lohacen.length === 0
                          ? `Lo hace todo el equipo: ${visibleStaff.map((b) => b.name.trim() || "sin nombre").join(", ")}`
                          : "Lo hacen sólo estas personas."}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {/* "Todos" no es un valor aparte: es la ausencia de
                            asignaciones. El atajo deja eso a la vista. */}
                        <button type="button"
                          onClick={() => setStaff(staff.map((x) => ({
                            ...x, service_ids: x.service_ids.filter((y) => y !== svc.id),
                          })))}
                          className={`rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors ${
                            lohacen.length === 0
                              ? "border-accent bg-accent-soft text-accent-ink"
                              : "border-dashed border-line bg-surface text-faint"
                          }`}>
                          Todos
                        </button>
                        {visibleStaff.map((b) => {
                          const on = b.service_ids.includes(svc.id!);
                          const idx = staff.indexOf(b);
                          return (
                            <button key={b.id ?? `n${idx}`} type="button"
                              onClick={() => setStaff(staff.map((x, j) => j !== idx ? x : {
                                ...x,
                                service_ids: on
                                  ? x.service_ids.filter((y) => y !== svc.id)
                                  : [...x.service_ids, svc.id!],
                              }))}
                              className={`rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors ${
                                on ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-muted"
                              }`}>
                              {b.name.trim() || "Sin nombre"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
          <button onClick={() => setServices([...services, { name: "", duration_min: 30, price: 0, booking_mode: "agenda" }])}
            className="w-full rounded-2xl border border-dashed border-line py-3 text-base text-accent-ink font-bold hover:border-accent transition-colors">
            + Agregar servicio
          </button>
        </SectionCard>

        {/* EQUIPO */}
        <SectionCard title={EQUIPO.seccion} onSave={saveStaff} saving={savingKey === "brb"} saved={savedKey === "brb"}>
          <p className="text-[13px] text-faint mb-4">
            {visibleStaff.length === 0 ? EQUIPO.vacio : EQUIPO.cargado}
          </p>

          {visibleStaff.map((brb) => {
            const realIndex = staff.indexOf(brb);
            return (
              <div key={brb.id ?? `new-${realIndex}`} className="rounded-2xl bg-surface-2 border border-line p-3 mb-2">
                <div className="flex gap-2">
                  <input value={brb.name} placeholder={EQUIPO.placeholderNombre}
                    onChange={(e) => setStaff(staff.map((b, j) => (j === realIndex ? { ...b, name: e.target.value } : b)))}
                    className="flex-1 rounded-xl bg-surface border border-line px-3 py-2 text-base outline-none focus:border-accent" />
                  <button onClick={() => setConfirmDelStaff(confirmDelStaff === realIndex ? null : realIndex)}
                    className="text-danger px-2" title="Quitar del equipo">✕</button>
                </div>

                {/* WhatsApp propio. Sólo hace falta para los servicios en modo
                    consulta; si no lo carga, esos clientes caen al número del
                    negocio, que siempre existe. */}
                {(() => {
                  const asignados = services.filter(
                    (s) => s.id && !s._deleted && (brb.service_ids.length === 0 || brb.service_ids.includes(s.id))
                  );
                  const haceConsulta = asignados.some((s) => s.booking_mode === "consulta");
                  if (!haceConsulta) return null;
                  return (
                    <div className="mt-2.5">
                      <label className="block text-[13px] text-faint mb-1.5">
                        Su WhatsApp — para los servicios que se coordinan hablando
                      </label>
                      <input value={brb.whatsapp} placeholder="351 234-5678" inputMode="tel"
                        onChange={(e) => setStaff(staff.map((b, j) => (j === realIndex ? { ...b, whatsapp: e.target.value } : b)))}
                        className="w-full rounded-xl bg-surface border border-line px-3 py-2 text-base outline-none focus:border-accent" />
                      {!brb.whatsapp.trim() && (
                        <p className="text-[12px] text-faint mt-1.5">
                          Sin número, esas consultas van a llegar al WhatsApp del negocio.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Qué servicios hace. Sólo los que ya existen en la base:
                    uno recién agregado todavía no tiene id para vincular. */}
                {services.some((s) => s.id && !s._deleted) && (
                  <div className="mt-2.5">
                    <div className="text-[13px] text-faint mb-1.5">
                      {brb.service_ids.length === 0
                        ? "Hace todos los servicios. Tocá alguno para limitarlo."
                        : "Sólo hace los servicios marcados."}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {services.filter((s) => s.id && !s._deleted).map((s) => {
                        const on = brb.service_ids.includes(s.id!);
                        return (
                          <button key={s.id} type="button"
                            onClick={() => setStaff(staff.map((b, j) => j !== realIndex ? b : {
                              ...b,
                              service_ids: on
                                ? b.service_ids.filter((x) => x !== s.id)
                                : [...b.service_ids, s.id!],
                            }))}
                            className={`rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors ${
                              on ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-muted"
                            }`}>
                            {s.name || "Sin nombre"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quitar = ya no trabaja más acá. Pedimos confirmación porque
                    se lleva puesta su disponibilidad futura. */}
                {confirmDelStaff === realIndex && (
                  <div className="mt-2 rounded-xl border border-danger/40 bg-danger-soft p-2.5">
                    <p className="text-[13px] text-body mb-2">
                      ¿Quitar a {brb.name.trim() || "esta persona"} del equipo? Sale de la lista y deja de recibir turnos.
                      Los turnos que ya tenía no se borran.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmDelStaff(null)}
                        className="flex-1 rounded-full border border-line bg-surface text-[13px] font-bold py-1.5">No</button>
                      <button onClick={() => {
                        setStaff(staff.map((b, j) => (j === realIndex ? { ...b, _deleted: true } : b)));
                        setConfirmDelStaff(null);
                      }} className="flex-1 rounded-full bg-danger text-white text-[13px] font-bold py-1.5">
                        Sí, quitar
                      </button>
                    </div>
                  </div>
                )}

                {/* Ausencias: sólo tienen sentido sobre alguien ya guardado. */}
                {brb.id ? (
                  <div className="mt-2.5">
                    <div className="text-[12px] font-bold uppercase tracking-widest text-faint mb-1.5">Días que no está</div>
                    <div className="flex gap-2 mb-2">
                      <input type="date" value={absenceDate[brb.id] ?? ""} min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setAbsenceDate({ ...absenceDate, [brb.id!]: e.target.value })}
                        className="flex-1 rounded-xl bg-surface border border-line px-3 py-2 text-base outline-none focus:border-accent" />
                      <button onClick={() => addAbsence(brb.id!)} disabled={!absenceDate[brb.id]}
                        className="rounded-full bg-accent text-on-accent font-bold text-[13px] px-4 disabled:opacity-25">
                        Marcar
                      </button>
                    </div>
                    {brb.absences.length === 0 ? (
                      <p className="text-[13px] text-faint">Trabaja todos los días abiertos del local.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {brb.absences.map((a) => (
                          <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-surface border border-line pl-2.5 pr-1.5 py-1">
                            <span className="font-mono text-[13px] text-accent-ink font-semibold">{a.date}</span>
                            <button onClick={() => removeAbsence(a.id)} className="text-faint hover:text-danger text-sm leading-none">✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[13px] text-faint mt-2">Guardá para poder marcarle días libres.</p>
                )}
              </div>
            );
          })}

          <button onClick={() => setStaff([...staff, { name: "", whatsapp: "", absences: [], service_ids: [] }])}
            className="w-full rounded-2xl border border-dashed border-line py-3 text-base text-accent-ink font-bold hover:border-accent transition-colors">
            {EQUIPO.agregar}
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
                className={`rounded-2xl bg-surface-2 border border-line px-3 py-2.5 mb-2 ${h.open ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-3">
                  <button onClick={() => setDay({ open: !h.open })}
                    className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${h.open ? "bg-accent" : "bg-line"}`}>
                    {/* Se mueve con transform y no con `left`: `left` recalcula
                        layout en cada cuadro, el transform va por GPU. Y se
                        anima sólo esa propiedad, no `all`. */}
                    <span className={`absolute top-[3px] left-[3px] w-3.5 h-3.5 rounded-full bg-surface transition-transform duration-200 ease-out ${h.open ? "translate-x-[17px]" : "translate-x-0"}`} />
                  </button>
                  <span className="text-sm font-bold text-ink">{d.label}</span>
                  {!h.open && <span className="ml-auto text-[13px] text-faint">Cerrado</span>}
                </div>

                {h.open && (
                  <div className="mt-2 pl-12 flex flex-col gap-1.5">
                    {h.ranges.map((r, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <select value={r.opens_at} onChange={(e) => setRange(i, { opens_at: e.target.value })} className={selectCls}>
                          {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                        </select>
                        <span className="text-[12px] text-faint">a</span>
                        <select value={r.closes_at} onChange={(e) => setRange(i, { closes_at: e.target.value })} className={selectCls}>
                          {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
                        </select>
                        {h.ranges.length > 1 && (
                          <button onClick={() => setDay({ ranges: h.ranges.filter((_, j) => j !== i) })}
                            className="text-faint hover:text-danger text-base px-1" title="Quitar franja">✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setDay({ ranges: [...h.ranges, { opens_at: "16:00", closes_at: "20:00" }] })}
                      className="text-[13px] text-accent-ink font-bold text-left mt-0.5">
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
          className="rounded-3xl bg-surface border border-line p-5 mb-4">
          <h2 className="text-lg font-extrabold text-ink mb-1">Días cerrados</h2>
          <p className="text-[13px] text-faint mb-4">Feriados, vacaciones, turnos médicos. Esos días nadie va a poder reservar.</p>

          <div className="flex gap-2 mb-2">
            <input type="date" value={newClosedDate} min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setNewClosedDate(e.target.value)}
              className="rounded-xl bg-surface border border-line px-3 py-2 text-base outline-none focus:border-accent" />
            <input value={newClosedReason} onChange={(e) => setNewClosedReason(e.target.value)} placeholder="Motivo (opcional)"
              className="flex-1 rounded-xl bg-surface border border-line px-3 py-2 text-base outline-none focus:border-accent" />
          </div>

          {/* Día completo vs rango horario puntual (ej: "médico 15-17") */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setClosedPartial(false)}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-bold border transition-colors ${!closedPartial ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"}`}>
              Todo el día
            </button>
            <button onClick={() => setClosedPartial(true)}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-bold border transition-colors ${closedPartial ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"}`}>
              Solo un rango
            </button>
          </div>
          {closedPartial && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[13px] text-faint">de</span>
              <select value={newClosedFrom} onChange={(e) => setNewClosedFrom(e.target.value)} className={selectCls}>
                <option value="">--</option>
                {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
              </select>
              <span className="text-[13px] text-faint">a</span>
              <select value={newClosedTo} onChange={(e) => setNewClosedTo(e.target.value)} className={selectCls}>
                <option value="">--</option>
                {HOUR_OPTS.map((o) => (<option key={o}>{o}</option>))}
              </select>
            </div>
          )}
          <motion.button whileTap={{ scale: 0.96 }} onClick={addClosed}
            disabled={!newClosedDate || (closedPartial && (!newClosedFrom || !newClosedTo))}
            className="w-full rounded-full bg-accent text-on-accent font-bold text-base py-2.5 disabled:opacity-25 mb-4 transition-opacity">
            {closedPartial ? "Bloquear rango" : "Bloquear fecha"}
          </motion.button>

          {closedList.length === 0 ? (
            <p className="text-[13px] text-faint text-center py-2">No hay fechas bloqueadas próximas.</p>
          ) : (
            closedList.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 rounded-2xl bg-surface-2 border border-line px-4 py-2.5 mb-2">
                <span className="font-mono text-base font-bold text-accent-ink">{c.date}</span>
                {c.from_time && (
                  <span className="font-mono text-[12px] text-accent-ink bg-accent-soft rounded px-1.5 py-0.5 shrink-0">
                    {c.from_time.slice(0, 5)}–{c.to_time?.slice(0, 5)}
                  </span>
                )}
                <span className="flex-1 text-sm text-muted truncate">{c.reason ?? (c.from_time ? "Rango bloqueado" : "Cerrado")}</span>
                <button onClick={() => removeClosed(c.id)} className="text-faint hover:text-danger text-base">✕</button>
              </div>
            ))
          )}
        </motion.div>

        </div>{/* fin grid de tarjetas */}
      </div>
    </main>
  );
}
