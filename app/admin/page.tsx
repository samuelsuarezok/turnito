// Panel de la plataforma. Cuánta gente usa Turnito y hasta cuándo tiene
// acceso cada local.
//
// ════════════════════════════════════════════════════════════════════════
// ESTA PÁGINA RENDERIZA EN EL SERVIDOR, Y ES LA ÚNICA DEL PROYECTO QUE LO HACE
//
// El resto de Turnito es "use client" y habla con Supabase desde el browser:
// funciona porque la RLS deja ver sólo el propio negocio. Acá hace falta lo
// contrario — ver todos — y eso lo da la service role key, que NUNCA puede
// viajar al cliente. De ahí que los datos se pidan en el server y bajen ya
// resueltos.
//
// Si en algún momento alguien agrega "use client" arriba de este archivo, la
// clave que saltea toda la seguridad de la app se publica en el bundle.
// ════════════════════════════════════════════════════════════════════════

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { identificarAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import Negocios from "./negocios";
import type { Negocio, Resumen } from "./tipos";

export const metadata: Metadata = {
  title: "Turnito · Plataforma",
  // Que no lo indexe nadie. No es la protección (esa es ADMIN_EMAILS), es
  // higiene: esta URL no tiene por qué aparecer en una búsqueda.
  robots: { index: false, follow: false },
};

const num = (n: number) => n.toLocaleString("es-AR");

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    // Timezone fija y no la del server: en Vercel es UTC y en tu máquina es
    // Córdoba, y la misma fecha se vería distinta según dónde corra.
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(iso));

const LABEL = "block text-[13px] font-bold uppercase tracking-widest text-faint mb-2";

function Tarjeta({
  titulo,
  valor,
  pie,
  tono = "normal",
}: {
  titulo: string;
  valor: string;
  pie: string;
  tono?: "normal" | "alerta" | "apagado";
}) {
  const color =
    tono === "alerta" ? "text-danger" : tono === "apagado" ? "text-faint" : "text-ink";
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className={LABEL}>{titulo}</div>
      <div className={`text-[26px] font-extrabold tabular-nums leading-none ${color}`}>{valor}</div>
      <div className="text-[14px] text-faint mt-1.5">{pie}</div>
    </div>
  );
}

export default async function AdminPage() {
  const quien = await identificarAdmin();

  // Sin sesión va a login, que es lo único útil que se puede hacer. Con sesión
  // ajena, 404: el que no es admin no tiene por qué saber que /admin existe.
  if (quien.estado === "anonimo") redirect("/login");
  if (quien.estado === "ajeno") notFound();

  const supabase = createAdminClient();
  const [resumenRes, negociosRes] = await Promise.all([
    supabase.rpc("admin_resumen"),
    supabase.rpc("admin_negocios"),
  ]);

  const fallo = resumenRes.error ?? negociosRes.error;
  if (fallo) {
    console.error("admin:", fallo.code, fallo.message);
  }

  const resumen = resumenRes.data as Resumen | null;
  const negocios = (negociosRes.data ?? []) as Negocio[];

  return (
    <main className="min-h-screen bg-canvas text-body p-5 lg:p-8">
      <div className="max-w-md lg:max-w-6xl mx-auto pb-16">
        <div className="flex items-center justify-between pt-2 mb-6">
          <div className="flex items-center gap-2.5">
            <LogoMark size={22} />
            <h1 className="text-[22px] font-extrabold text-ink tracking-tight">Plataforma</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/panel" className="text-[14px] text-accent-ink font-bold">
              ← Mi panel
            </Link>
          </div>
        </div>

        {fallo && (
          <div className="rounded-3xl bg-surface border border-danger p-5 mb-5">
            <h2 className="text-xl font-extrabold text-danger mb-1">No se pudieron traer los datos</h2>
            <p className="text-lg text-muted">
              {fallo.code === "PGRST202" ? (
                <>
                  Las funciones del panel todavía no están en la base. Falta correr{" "}
                  <code className="font-mono text-[15px]">
                    npm run db:migrate supabase/migrations/0013_admin_plataforma.sql
                  </code>
                  .
                </>
              ) : (
                <>Error {fallo.code}. El detalle está en los logs del servidor.</>
              )}
            </p>
          </div>
        )}

        {resumen && (
          <>
            {/* Lo primero: cuánta gente hay adentro y cuánta la usa de verdad. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
              <Tarjeta
                titulo="Cuentas"
                valor={num(resumen.cuentas.total)}
                pie={`+${resumen.cuentas.ultimos_30} en 30 días`}
              />
              <Tarjeta
                titulo="Locales"
                valor={num(resumen.negocios.total)}
                pie={
                  resumen.cuentas.sin_negocio > 0
                    ? `${resumen.cuentas.sin_negocio} cuentas sin local`
                    : "todas las cuentas publicaron"
                }
              />
              <Tarjeta
                titulo="Locales vivos"
                valor={num(resumen.uso.locales_vivos_30)}
                pie="con turnos en 30 días"
              />
              <Tarjeta
                titulo="Personas"
                valor={num(resumen.uso.personas)}
                pie={`${num(resumen.uso.personas_30)} reservaron en 30 días`}
              />
            </div>

            {/* Lo segundo: a quién hay que cobrarle. */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-3">
              <Tarjeta
                titulo="Pagando"
                valor={num(resumen.negocios.pagando)}
                pie="estado activo"
              />
              <Tarjeta
                titulo="En prueba"
                valor={num(resumen.negocios.en_prueba)}
                pie="con días por delante"
              />
              <Tarjeta
                titulo="Vencen en 7 días"
                valor={num(resumen.negocios.vencen_en_7)}
                pie="hay que hablarles ahora"
              />
              <Tarjeta
                titulo="Prueba vencida"
                valor={num(resumen.negocios.prueba_vencida)}
                pie="operando gratis"
                tono={resumen.negocios.prueba_vencida > 0 ? "alerta" : "normal"}
              />
              <Tarjeta
                titulo="Cortados"
                valor={num(resumen.negocios.cortados)}
                pie="fuera de línea"
                tono="apagado"
              />
            </div>

            <p className="text-[14px] text-faint mb-6">
              {num(resumen.uso.turnos)} turnos reservados desde el día uno ·{" "}
              {num(resumen.uso.turnos_30)} en los últimos 30 días · {num(resumen.uso.turnos_7)} en
              los últimos 7. Altas de la semana: {resumen.cuentas.ultimos_7} cuentas,{" "}
              {resumen.negocios.ultimos_7} locales.
            </p>
          </>
        )}

        {resumen && resumen.negocios.prueba_vencida > 0 && (
          // No es un detalle de UI: hoy la app filtra por ESTADO, no por fecha.
          // Un local con la prueba vencida sigue tomando turnos hasta que alguien
          // lo corta a mano. Decirlo acá es la única forma de que no se olvide.
          <div className="rounded-3xl bg-danger-soft border border-danger p-4 mb-6">
            <p className="text-lg text-danger">
              <strong>
                {resumen.negocios.prueba_vencida}{" "}
                {resumen.negocios.prueba_vencida === 1 ? "local tiene" : "locales tienen"} la prueba
                vencida y {resumen.negocios.prueba_vencida === 1 ? "sigue" : "siguen"} operando.
              </strong>{" "}
              Nada corta el acceso solo: mientras el estado diga «prueba», el local toma turnos
              igual. Filtrá por «Vencidos» y decidí uno por uno.
            </p>
          </div>
        )}

        <Negocios lista={negocios} />

        {resumen && resumen.sin_negocio.length > 0 && (
          <div className="rounded-3xl bg-surface border border-line p-5 mt-5">
            <h2 className="text-xl font-extrabold text-ink mb-1">Se registraron y no publicaron</h2>
            <p className="text-[14px] text-faint mb-4">
              Crearon la cuenta y abandonaron el onboarding. Son a quienes tiene sentido escribirles.
              {resumen.cuentas.sin_negocio > resumen.sin_negocio.length &&
                ` Se muestran las ${resumen.sin_negocio.length} más recientes de ${resumen.cuentas.sin_negocio}.`}
            </p>
            <ul className="divide-y divide-line">
              {resumen.sin_negocio.map((c) => (
                <li key={c.email ?? c.creada} className="flex justify-between gap-3 py-2">
                  <span className="text-lg text-ink truncate">{c.email ?? "sin mail"}</span>
                  <span className="text-[15px] text-faint shrink-0 tabular-nums">
                    {fecha(c.creada)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
