"use client";

// La lista de locales del panel de plataforma.
//
// Es cliente porque acá se busca, se filtra y se ordena, y todo eso tiene que
// pasar sin ir al server. Pero NO habla con Supabase: los datos bajan como prop
// desde app/admin/page.tsx (que sí corre en el server) y los cambios salen por
// una server action. Este archivo no tiene acceso a nada de la base.

import { useActionState, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cambiarAcceso } from "./acciones";
import type { Negocio } from "./tipos";

const EASE = [0.22, 1, 0.36, 1] as const;

const TZ = "America/Argentina/Cordoba";
const fmtFecha = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TZ,
});
// Timezone explícita, siempre: la primera pintada la hace el server (UTC en
// Vercel) y la hidratación el browser. Sin fijarla, las dos escriben fechas
// distintas y React tira un error de hidratación.
const fecha = (iso: string | null) => (iso ? fmtFecha.format(new Date(iso)) : "—");

const RUBRO_EMOJI: Record<string, string> = {
  barberia: "💈",
  unas: "💅",
  pestanas: "👁️",
  tatuajes: "🖋️",
  peluqueria: "✂️",
  otro: "🗓️",
};

/** Las cuatro situaciones en las que puede estar un local. */
type Situacion = "pagando" | "prueba" | "vencido" | "cortado";

function situacion(n: Negocio): Situacion {
  if (n.estado === "active") return "pagando";
  if (n.estado !== "trial") return "cortado";
  return n.dias < 0 ? "vencido" : "prueba";
}

const BADGE: Record<Situacion, { texto: string; clase: string }> = {
  pagando: { texto: "Pagando", clase: "bg-highlight text-on-highlight" },
  prueba: { texto: "Prueba", clase: "bg-accent-soft text-accent-ink" },
  vencido: { texto: "Vencido", clase: "bg-danger-soft text-danger" },
  cortado: { texto: "Cortado", clase: "bg-surface-2 text-faint border border-line" },
};

type FiltroId = "todos" | "prueba" | "porvencer" | "vencidos" | "pagando" | "cortados";

const FILTROS: { id: FiltroId; label: string; test: (n: Negocio) => boolean }[] = [
  { id: "todos", label: "Todos", test: () => true },
  { id: "prueba", label: "En prueba", test: (n) => situacion(n) === "prueba" },
  {
    // Los que hay que ir a buscar esta semana. Incluye a los que ya pagaron:
    // a esos también se les termina el mes.
    id: "porvencer",
    label: "Vencen en 7 días",
    test: (n) => ["prueba", "pagando"].includes(situacion(n)) && n.dias >= 0 && n.dias <= 7,
  },
  { id: "vencidos", label: "Vencidos", test: (n) => situacion(n) === "vencido" },
  { id: "pagando", label: "Pagando", test: (n) => situacion(n) === "pagando" },
  { id: "cortados", label: "Cortados", test: (n) => situacion(n) === "cortado" },
];

type OrdenId = "recientes" | "vence" | "uso";

const ORDENES: { id: OrdenId; label: string; cmp: (a: Negocio, b: Negocio) => number }[] = [
  { id: "recientes", label: "Más nuevos", cmp: (a, b) => a.antiguedad - b.antiguedad },
  { id: "vence", label: "Vence antes", cmp: (a, b) => a.dias - b.dias },
  { id: "uso", label: "Más turnos", cmp: (a, b) => b.turnos_30 - a.turnos_30 },
];

/** "quedan 12 días" / "venció hace 3 días", que es lo que uno quiere leer. */
function cuantoQueda(dias: number) {
  if (dias < 0) return `venció hace ${-dias} ${-dias === 1 ? "día" : "días"}`;
  if (dias === 0) return "vence hoy";
  return `quedan ${dias} ${dias === 1 ? "día" : "días"}`;
}

const btn =
  "rounded-full px-3 py-1.5 text-[14px] font-bold transition-opacity disabled:opacity-40";

function Fila({ n }: { n: Negocio }) {
  const [res, enviar, pendiente] = useActionState(cambiarAcceso, null);
  const sit = situacion(n);
  const badge = BADGE[sit];

  return (
    <div className="rounded-3xl bg-surface border border-line p-4 lg:p-5">
      <div className="lg:flex lg:items-start lg:gap-6">
        {/* Quién es */}
        <div className="min-w-0 lg:flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span aria-hidden>{RUBRO_EMOJI[n.rubro ?? "otro"] ?? "🗓️"}</span>
            <h3 className="text-lg font-extrabold text-ink truncate">{n.nombre}</h3>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${badge.clase}`}>
              {badge.texto}
            </span>
          </div>
          <a
            href={`/${n.slug}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[14px] text-accent-ink hover:underline"
          >
            /{n.slug}
          </a>
          <p className="text-[14px] text-muted truncate mt-0.5">{n.email ?? "sin dueño"}</p>
          <p className="text-[13px] text-faint mt-0.5">
            Alta {fecha(n.creado)} · hace {n.antiguedad} {n.antiguedad === 1 ? "día" : "días"} ·
            último ingreso {fecha(n.ultimo_ingreso)}
          </p>
        </div>

        {/* Cómo lo usa */}
        <div className="mt-3 lg:mt-0 lg:w-52 shrink-0">
          <div className="text-[15px] text-ink tabular-nums">
            <strong>{n.turnos_30}</strong> turnos en 30 días
          </div>
          <div className="text-[13px] text-faint tabular-nums">
            {n.turnos} en total · {n.equipo} en el equipo
          </div>
          <div className="text-[13px] text-faint">
            {n.ultimo_turno ? `último turno ${fecha(n.ultimo_turno)}` : "nunca reservaron"}
          </div>
        </div>

        {/* Hasta cuándo, y las palancas */}
        <div className="mt-3 lg:mt-0 lg:w-72 shrink-0">
          <div className={`text-[15px] tabular-nums ${n.dias < 0 ? "text-danger" : "text-ink"}`}>
            {fecha(n.vence)} · {cuantoQueda(n.dias)}
          </div>

          <form action={enviar} className="flex flex-wrap items-center gap-1.5 mt-2">
            <input type="hidden" name="negocio" value={n.id} />
            <input
              name="dias"
              defaultValue={30}
              inputMode="numeric"
              aria-label="Días a sumar"
              className="w-14 rounded-full bg-surface-2 border border-line px-2.5 py-1.5 text-[14px] text-center tabular-nums outline-none focus:border-accent"
            />
            <button
              name="accion"
              value="cobrado"
              disabled={pendiente}
              className={`${btn} bg-accent text-on-accent`}
              title="Suma los días y lo marca como pagando"
            >
              {pendiente ? "…" : "Cobré"}
            </button>
            <button
              name="accion"
              value="extender"
              disabled={pendiente}
              className={`${btn} bg-surface-2 text-ink border border-line`}
              title="Suma los días sin cambiar el estado"
            >
              + días
            </button>
            {sit === "cortado" ? (
              <button
                name="accion"
                value="reactivar"
                disabled={pendiente}
                className={`${btn} bg-surface-2 text-accent-ink border border-line`}
              >
                Reactivar
              </button>
            ) : (
              <button
                name="accion"
                value="cortar"
                disabled={pendiente}
                // Deja al local fuera de línea: /<slug> no lo encuentra y sus
                // clientes no pueden reservar. Un click de más no puede hacer eso.
                onClick={(e) => {
                  const ok = window.confirm(
                    `¿Cortar ${n.nombre}? Deja de tomar turnos y su link deja de andar.`
                  );
                  if (!ok) e.preventDefault();
                }}
                className={`${btn} bg-surface-2 text-danger border border-line`}
              >
                Cortar
              </button>
            )}
          </form>

          {res && (
            <p className={`text-[14px] mt-2 ${res.ok ? "text-accent-ink" : "text-danger"}`}>
              {res.mensaje}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Negocios({ lista }: { lista: Negocio[] }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroId>("todos");
  const [orden, setOrden] = useState<OrdenId>("recientes");

  // Los contadores de los chips salen de la lista completa, no de la filtrada:
  // si dependieran del filtro activo, todos menos uno mostrarían cero.
  const cuentas = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, lista.filter(f.test).length])),
    [lista]
  );

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const test = FILTROS.find((f) => f.id === filtro)!.test;
    const cmp = ORDENES.find((o) => o.id === orden)!.cmp;
    return lista
      .filter(test)
      .filter(
        (n) =>
          !texto ||
          n.nombre.toLowerCase().includes(texto) ||
          n.slug.includes(texto) ||
          (n.email ?? "").toLowerCase().includes(texto) ||
          n.whatsapp.includes(texto)
      )
      .sort(cmp);
  }, [lista, q, filtro, orden]);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, link, mail o WhatsApp"
          className="flex-1 min-w-[220px] rounded-full bg-surface border border-line px-4 py-2 text-[15px] outline-none focus:border-accent transition-colors"
        />
        <div className="flex gap-1.5">
          {ORDENES.map((o) => (
            <button
              key={o.id}
              onClick={() => setOrden(o.id)}
              className={`rounded-full border px-3 py-1.5 text-[14px] font-bold transition-colors ${
                orden === o.id ? "bg-surface-2 text-ink border-line" : "bg-transparent text-faint border-transparent"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-bold transition-colors ${
              filtro === f.id ? "bg-accent text-on-accent border-accent" : "bg-surface text-muted border-line"
            }`}
          >
            {f.label} <span className="tabular-nums opacity-60">{cuentas[f.id]}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="text-lg text-faint py-8 text-center">
          {lista.length === 0 ? "Todavía no hay ningún local publicado." : "Ningún local entra en ese filtro."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {visibles.map((n) => (
            <Fila key={n.id} n={n} />
          ))}
        </div>
      )}
    </motion.section>
  );
}
