"use client";

// Los números del negocio en un rango de fechas.
//
// Todo lo pesado lo hace la base: stats_negocio() agrupa y devuelve un JSON
// chico. Acá sólo se elige el período y se dibuja. Ver 0011_stats_negocio.sql.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { motion } from "framer-motion";
import { turnosACsv, descargarCsv, type FilaTurno } from "@/lib/csv";

const EASE = [0.22, 1, 0.36, 1] as const;

type Totales = {
  hechos: number; pendientes: number; ausencias: number;
  cancelo_cliente: number; cancelo_local: number;
  facturado: number; sin_precio: number;
};
type PorServicio = { nombre: string; hechos: number; facturado: number };
type PorPersona = { nombre: string; hechos: number; ausencias: number; facturado: number };
type PorDia = { fecha: string; hechos: number; facturado: number };
type Stats = {
  desde: string; hasta: string;
  totales: Totales;
  por_servicio: PorServicio[];
  por_persona: PorPersona[];
  por_dia: PorDia[];
};

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

/** Rangos que un local pide de verdad. Nadie escribe fechas a mano si puede evitarlo. */
function rangos() {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const inicioMesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const finMesPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  const hace30 = new Date(); hace30.setDate(hace30.getDate() - 29);
  const hace90 = new Date(); hace90.setDate(hace90.getDate() - 89);
  return [
    { id: "mes", label: "Este mes", desde: fmtDate(inicioMes), hasta: fmtDate(hoy) },
    { id: "mespas", label: "Mes pasado", desde: fmtDate(inicioMesPasado), hasta: fmtDate(finMesPasado) },
    { id: "30", label: "Últimos 30 días", desde: fmtDate(hace30), hasta: fmtDate(hoy) },
    { id: "90", label: "Últimos 90 días", desde: fmtDate(hace90), hasta: fmtDate(hoy) },
  ];
}

const label = "block text-[13px] font-bold uppercase tracking-widest text-faint mb-2";

/** Una fila de la comparativa. El ancho de la barra es relativo al mayor. */
function Barra({ nombre, valor, maximo, detalle }: {
  nombre: string; valor: number; maximo: number; detalle: string;
}) {
  const pct = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0;
  return (
    <div className="mb-2.5">
      <div className="flex justify-between items-baseline mb-1 gap-3">
        <span className="text-lg font-semibold text-ink truncate">{nombre}</span>
        <span className="text-[15px] text-muted tabular-nums shrink-0">{detalle}</span>
      </div>
      <div className="h-2 rounded-full bg-canvas overflow-hidden">
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.45, ease: EASE }}
          className="h-full rounded-full bg-accent"
        />
      </div>
    </div>
  );
}

export default function StatsPage() {
  const supabase = createClient();
  const router = useRouter();

  const opciones = useMemo(() => rangos(), []);
  const [rango, setRango] = useState(opciones[0]);
  const [shop, setShop] = useState<{ id: string; slug: string } | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return router.push("/login");
      const { data } = await supabase.from("businesses").select("id, slug").maybeSingle();
      if (!data) return router.push("/onboarding");
      setShop(data);
      const { data: brs } = await supabase
        .from("staff").select("id, name").eq("business_id", data.id).order("sort_order");
      setStaff((brs ?? []) as { id: string; name: string }[]);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("stats_negocio", {
      desde: rango.desde, hasta: rango.hasta,
    });
    if (e) {
      // El error real al log: sin esto, cualquier falla se ve igual y no hay
      // por dónde empezar a buscar.
      console.error("stats_negocio:", e.code, e.message);
      // PGRST202 = la función no está en la base. Pasa si se deployó el código
      // sin correr 0011_stats_negocio.sql. Decirlo así evita mandar a alguien a
      // "probar de nuevo" con algo que no se arregla reintentando.
      return setError(
        e.code === "PGRST202"
          ? "Esta pantalla todavía no está habilitada en la base. Falta correr la migración 0011_stats_negocio.sql."
          : "No pudimos traer los números. Revisá la conexión y probá de nuevo."
      );
    }
    setError("");
    setStats(data as Stats);
  }, [supabase, rango]);

  // Mismo caso que loadAppts en /panel, y el disable va por la misma razón:
  // dentro de `cargar` TODOS los setState ocurren después del await, o sea
  // cuando vuelve la red. Eso no es el render en cascada que la regla busca
  // evitar — es un fetch, que es para lo que existe useEffect. El linter no ve
  // a través del await.
  //
  // Si algún día `cargar` toca estado de forma SÍNCRONA (un setLoading(true) al
  // principio, por ejemplo), este disable deja de ser válido. Justamente por eso
  // "cargando" es derivado más abajo y no un flag.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar(); }, [cargar]);

  // "Cargando" es DERIVADO: es verdad mientras lo que tenemos en pantalla no
  // corresponda al rango elegido. Así no hay un flag que mantener en sincronía,
  // y el efecto no toca estado de forma síncrona.
  const cargando = !stats || stats.desde !== rango.desde || stats.hasta !== rango.hasta;

  async function bajar() {
    if (!shop || bajando) return;
    setBajando(true);
    try {
      const { data } = await supabase
        .from("appointments")
        .select("date, time, status, client_name, client_phone, service_name, price, staff_id")
        .eq("business_id", shop.id)
        .gte("date", rango.desde).lte("date", rango.hasta)
        .order("date").order("time");
      const nombre = (id: string | null) => staff.find((b) => b.id === id)?.name ?? null;
      descargarCsv(
        turnosACsv((data ?? []) as FilaTurno[], nombre),
        `turnito-${shop.slug}-${rango.desde}-a-${rango.hasta}.csv`
      );
    } finally {
      setBajando(false);
    }
  }

  const t = stats?.totales;
  // Denominador de la tasa de ausentismo: sólo los turnos que llegaron a su
  // día. Los cancelados con aviso no son ausencias — el horario se liberó.
  const cerrados = (t?.hechos ?? 0) + (t?.ausencias ?? 0);
  const tasaAusencia = cerrados > 0 ? Math.round(((t?.ausencias ?? 0) / cerrados) * 100) : 0;

  const maxServicio = Math.max(1, ...(stats?.por_servicio ?? []).map((s) => s.hechos));
  const maxPersona = Math.max(1, ...(stats?.por_persona ?? []).map((s) => s.facturado));
  const maxDia = Math.max(1, ...(stats?.por_dia ?? []).map((d) => d.facturado));

  return (
    <main className="min-h-screen bg-canvas text-body p-5 lg:p-8">
      <div className="max-w-md lg:max-w-5xl mx-auto pb-16">
        <motion.div className="flex items-center justify-between pt-2 mb-6"
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div className="flex items-center gap-2.5">
            <LogoMark size={22} />
            <h1 className="text-[22px] font-extrabold text-ink tracking-tight">Números</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/panel" className="text-[14px] text-accent-ink font-bold">← Volver al panel</Link>
          </div>
        </motion.div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
          {opciones.map((o) => (
            <button key={o.id} onClick={() => setRango(o)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-bold transition-colors ${
                rango.id === o.id ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"}`}>
              {o.label}
            </button>
          ))}
        </div>

        {error && <p className="text-lg text-danger mb-4">{error}</p>}

        {!stats ? (
          <div className="animate-pulse space-y-3">
            <div className="h-24 rounded-3xl bg-surface" />
            <div className="h-40 rounded-3xl bg-surface" />
          </div>
        ) : (
          // Al cambiar de rango se atenúa lo viejo en vez de vaciar la pantalla:
          // el salto de layout molesta más que esperar medio segundo viendo los
          // números anteriores en gris.
          <div className={`transition-opacity duration-200 ${cargando ? "opacity-40" : "opacity-100"}`}>
            {/* Lo que importa primero: cuánto entró y cuántos se atendieron. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
              <div className="rounded-2xl bg-surface border border-line p-4">
                <div className={label}>Facturado</div>
                <div className="text-[26px] font-extrabold text-ink tabular-nums leading-none">
                  {pesos(t!.facturado)}
                </div>
                <div className="text-[14px] text-faint mt-1.5">{t!.hechos} turnos atendidos</div>
              </div>
              <div className="rounded-2xl bg-surface border border-line p-4">
                <div className={label}>Ticket promedio</div>
                <div className="text-[26px] font-extrabold text-ink tabular-nums leading-none">
                  {pesos(t!.hechos > 0 ? Math.round(t!.facturado / t!.hechos) : 0)}
                </div>
                <div className="text-[14px] text-faint mt-1.5">por turno atendido</div>
              </div>
              <div className="rounded-2xl bg-surface border border-line p-4">
                <div className={label}>Ausencias</div>
                <div className={`text-[26px] font-extrabold tabular-nums leading-none ${t!.ausencias > 0 ? "text-danger" : "text-ink"}`}>
                  {t!.ausencias}
                </div>
                <div className="text-[14px] text-faint mt-1.5">{tasaAusencia}% de los que llegaron al día</div>
              </div>
              <div className="rounded-2xl bg-surface border border-line p-4">
                <div className={label}>Cancelados</div>
                <div className="text-[26px] font-extrabold text-ink tabular-nums leading-none">
                  {t!.cancelo_cliente + t!.cancelo_local}
                </div>
                <div className="text-[14px] text-faint mt-1.5">
                  {t!.cancelo_cliente} el cliente · {t!.cancelo_local} el local
                </div>
              </div>
            </div>

            {t!.sin_precio > 0 && (
              <p className="text-[14px] text-faint -mt-2 mb-5">
                {t!.sin_precio} {t!.sin_precio === 1 ? "turno atendido no tiene" : "turnos atendidos no tienen"} precio
                guardado (son anteriores a que empezáramos a registrarlo), así que lo facturado queda corto.
              </p>
            )}

            <div className="lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
              <div>
                <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
                  <h2 className="text-xl font-extrabold text-ink mb-4">Qué se hizo</h2>
                  {stats.por_servicio.length === 0 ? (
                    <p className="text-lg text-faint">Todavía no hay turnos atendidos en este período.</p>
                  ) : stats.por_servicio.map((s) => (
                    <Barra key={s.nombre} nombre={s.nombre} valor={s.hechos} maximo={maxServicio}
                      detalle={`${s.hechos} · ${pesos(s.facturado)}`} />
                  ))}
                </div>

                <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
                  <h2 className="text-xl font-extrabold text-ink mb-1">Quién lo hizo</h2>
                  <p className="text-[14px] text-faint mb-4">Ordenado por lo que trajo cada uno.</p>
                  {stats.por_persona.length === 0 ? (
                    <p className="text-lg text-faint">No hay turnos asignados a nadie en este período.</p>
                  ) : stats.por_persona.map((p) => (
                    <Barra key={p.nombre} nombre={p.nombre} valor={p.facturado} maximo={maxPersona}
                      detalle={`${pesos(p.facturado)} · ${p.hechos} turnos${p.ausencias > 0 ? ` · ${p.ausencias} faltaron` : ""}`} />
                  ))}
                </div>
              </div>

              <div>
                <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
                  <h2 className="text-xl font-extrabold text-ink mb-1">Día por día</h2>
                  <p className="text-[14px] text-faint mb-4">Cuánto entró cada día del período.</p>
                  <div className="flex items-end gap-[3px] h-28">
                    {stats.por_dia.map((d) => (
                      <div key={d.fecha} className="flex-1 min-w-0 group relative"
                        title={`${d.fecha} · ${pesos(d.facturado)} · ${d.hechos} turnos`}>
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(2, (d.facturado / maxDia) * 112)}px` }}
                          transition={{ duration: 0.4, ease: EASE }}
                          className={`w-full rounded-sm ${d.facturado > 0 ? "bg-accent" : "bg-line"}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[13px] text-faint mt-2 font-mono">
                    <span>{stats.desde}</span>
                    <span>{stats.hasta}</span>
                  </div>
                </div>

                <div className="rounded-3xl bg-surface border border-line p-5">
                  <h2 className="text-xl font-extrabold text-ink mb-1">Descargar</h2>
                  <p className="text-[14px] text-faint mb-4">
                    Un archivo con todos los turnos del período, uno por fila. Se abre con Excel.
                  </p>
                  <button onClick={bajar} disabled={bajando}
                    className="w-full rounded-full bg-accent text-on-accent font-bold text-lg py-3 disabled:opacity-40 transition-opacity">
                    {bajando ? "Preparando…" : "↓ Descargar el período"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
