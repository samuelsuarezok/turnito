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
import { IcoAtras, IcoDescarga } from "@/components/icons";
import * as ui from "@/lib/ui";
import { cap, diaMes, fechaCorta } from "@/lib/fechas";

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

/**
 * Una fila de la comparativa. El ancho de la barra es relativo al mayor.
 * La primera (la que más hizo) va en acento y el resto en neutro: un solo
 * color que marca lo que importa, no una lista entera pintada de azul.
 * Se anima con scaleX y no con width, así no recalcula layout en cada cuadro.
 */
function Barra({ nombre, valor, maximo, detalle, destacada }: {
  nombre: string; valor: number; maximo: number; detalle: string; destacada: boolean;
}) {
  const pct = maximo > 0 ? Math.max(0.02, valor / maximo) : 0;
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-baseline mb-2 gap-3">
        <span className="text-[15px] leading-5 font-medium text-ink truncate">{nombre}</span>
        <span className="text-[14px] leading-5 text-muted tabular-nums shrink-0">{detalle}</span>
      </div>
      <div className="h-1.5 rounded-full bg-canvas overflow-hidden">
        <motion.div
          initial={{ scaleX: 0 }} animate={{ scaleX: pct }}
          transition={{ duration: 0.45, ease: EASE }}
          className={`h-full w-full rounded-full origin-left ${destacada ? "bg-accent" : "bg-faint"}`}
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

  // El mejor día del período: es el único que va en acento en el gráfico, y
  // lo decimos con palabras abajo para que el gráfico cuente algo.
  const mejorDia = (stats?.por_dia ?? []).reduce<PorDia | null>(
    (best, d) => (d.facturado > 0 && (!best || d.facturado > best.facturado) ? d : best), null);

  return (
    <main className="min-h-screen bg-canvas text-body p-4 sm:p-6 lg:p-8">
      <div className="max-w-md lg:max-w-5xl mx-auto pb-16">
        <header className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <h1 className="text-[20px] leading-7 font-semibold text-ink">Números</h1>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle className="mr-1" />
            <Link href="/panel" className={ui.navLink}>
              <IcoAtras /><span><span className="hidden sm:inline">Volver al </span>panel</span>
            </Link>
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {opciones.map((o) => (
            <button key={o.id} onClick={() => setRango(o)} aria-pressed={rango.id === o.id}
              className={ui.chip(rango.id === o.id)}>
              {o.label}
            </button>
          ))}
        </div>

        {error && <p role="alert" className={`${ui.errorBox} mb-6`}>{error}</p>}

        {!stats ? (
          <div className="animate-pulse space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-surface" />)}
            </div>
            <div className="h-48 rounded-3xl bg-surface" />
          </div>
        ) : (
          // Al cambiar de rango se atenúa lo viejo en vez de vaciar la pantalla:
          // el salto de layout molesta más que esperar medio segundo viendo los
          // números anteriores en gris.
          <div className={`transition-opacity duration-200 ${cargando ? "opacity-40" : "opacity-100"}`}>
            {/* Lo que importa primero: cuánto entró y cuántos se atendieron. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
              <Stat label="Facturado" valor={pesos(t!.facturado)} sub={`${t!.hechos} turnos atendidos`} />
              <Stat label="Ticket promedio" valor={pesos(t!.hechos > 0 ? Math.round(t!.facturado / t!.hechos) : 0)}
                sub="por turno atendido" />
              <Stat label="Ausencias" valor={String(t!.ausencias)} alerta={t!.ausencias > 0}
                sub={`${tasaAusencia}% de los que llegaron al día`} />
              <Stat label="Cancelados" valor={String(t!.cancelo_cliente + t!.cancelo_local)}
                sub={`${t!.cancelo_cliente} el cliente · ${t!.cancelo_local} el local`} />
            </div>

            {t!.sin_precio > 0 && (
              <p className={`${ui.ayuda} -mt-2 mb-6`}>
                {t!.sin_precio} {t!.sin_precio === 1 ? "turno atendido no tiene" : "turnos atendidos no tienen"} precio
                guardado (son anteriores a que empezáramos a registrarlo), así que lo facturado queda corto.
              </p>
            )}

            <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
              <div>
                <section className={`${ui.card} p-5 sm:p-6 mb-4`}>
                  <h2 className={`${ui.h2} mb-5`}>Qué se hizo</h2>
                  {stats.por_servicio.length === 0 ? (
                    <p className="text-[15px] leading-6 text-muted">Todavía no hay turnos atendidos en este período.</p>
                  ) : stats.por_servicio.map((s, i) => (
                    <Barra key={s.nombre} nombre={s.nombre} valor={s.hechos} maximo={maxServicio} destacada={i === 0}
                      detalle={`${s.hechos} · ${pesos(s.facturado)}`} />
                  ))}
                </section>

                <section className={`${ui.card} p-5 sm:p-6 mb-4`}>
                  <h2 className={ui.h2}>Quién lo hizo</h2>
                  <p className="text-[14px] leading-5 text-muted mt-1 mb-5">Ordenado por lo que trajo cada uno</p>
                  {stats.por_persona.length === 0 ? (
                    <p className="text-[15px] leading-6 text-muted">No hay turnos asignados a nadie en este período.</p>
                  ) : stats.por_persona.map((p, i) => (
                    <Barra key={p.nombre} nombre={p.nombre} valor={p.facturado} maximo={maxPersona} destacada={i === 0}
                      detalle={`${pesos(p.facturado)} · ${p.hechos} turnos${p.ausencias > 0 ? ` · ${p.ausencias} faltaron` : ""}`} />
                  ))}
                </section>
              </div>

              <div>
                <section className={`${ui.card} p-5 sm:p-6 mb-4`}>
                  <h2 className={ui.h2}>Día por día</h2>
                  <p className="text-[14px] leading-5 text-muted mt-1 mb-5">Cuánto entró cada día del período</p>
                  {/* Barras neutras y una sola en acento: el mejor día. Se
                      animan con scaleY desde abajo, no con height. */}
                  <div className="flex items-end gap-[3px] h-32 border-b border-line">
                    {stats.por_dia.map((d) => {
                      const alto = d.facturado > 0 ? Math.max(4, (d.facturado / maxDia) * 128) : 2;
                      return (
                        <div key={d.fecha} className="flex-1 min-w-0"
                          title={`${cap(fechaCorta(d.fecha))} · ${pesos(d.facturado)} · ${d.hechos} turnos`}>
                          <motion.div
                            initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                            transition={{ duration: 0.4, ease: EASE }}
                            style={{ height: alto }}
                            className={`w-full rounded-t-[2px] origin-bottom ${
                              mejorDia && d.fecha === mejorDia.fecha ? "bg-accent" : d.facturado > 0 ? "bg-faint" : "bg-line"}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[12px] leading-4 text-muted mt-2 font-mono">
                    <span>{diaMes(stats.desde)}</span>
                    <span>{diaMes(stats.hasta)}</span>
                  </div>
                  {mejorDia && (
                    <p className="text-[14px] leading-5 text-muted mt-4">
                      Mejor día: <span className="text-ink font-medium">{fechaCorta(mejorDia.fecha)}</span>, con{" "}
                      <span className="text-ink font-medium tabular-nums">{pesos(mejorDia.facturado)}</span> en{" "}
                      {mejorDia.hechos} {mejorDia.hechos === 1 ? "turno" : "turnos"}
                    </p>
                  )}
                </section>

                <section className={`${ui.card} p-5 sm:p-6`}>
                  <h2 className={ui.h2}>Descargar</h2>
                  <p className="text-[14px] leading-5 text-muted mt-1 mb-5">
                    Un archivo con todos los turnos del período, uno por fila. Se abre con Excel.
                  </p>
                  <button onClick={bajar} disabled={bajando} aria-busy={bajando} className={`${ui.btnSecondary} w-full`}>
                    {bajando ? "Preparando…" : <><IcoDescarga /> Descargar el período</>}
                  </button>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, valor, sub, alerta = false }: { label: string; valor: string; sub: string; alerta?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className="text-[13px] leading-5 text-muted">{label}</div>
      <div className={`text-[24px] sm:text-[28px] leading-none font-semibold tabular-nums mt-2 ${alerta ? "text-danger" : "text-ink"}`}>
        {valor}
      </div>
      <div className="text-[13px] leading-5 text-muted mt-2">{sub}</div>
    </div>
  );
}
