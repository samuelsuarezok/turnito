"use server";

// Las tres palancas del panel de plataforma: correr el vencimiento, registrar
// un cobro y cortar un local. Todo termina en la misma RPC, admin_acceso().
//
// ⚠️ EL CHEQUEO DE ADMIN VA ACÁ ADENTRO, NO ALCANZA CON EL DE LA PÁGINA.
// Una server action es un endpoint POST público: Next le pone una URL y
// cualquiera puede pegarle sin pasar por /admin. Que la página ya haya
// verificado no protege nada — el que llama puede no haber abierto la página.
// (Está en la guía: node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md)

import { refresh } from "next/cache";
import { identificarAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type Resultado = { ok: boolean; mensaje: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Movimiento = "extender" | "cobrado" | "cortar" | "reactivar";

/** Los cuatro movimientos posibles, y qué le manda a la base cada uno. */
const MOVIMIENTOS: Record<Movimiento, { estado: string | null; usaDias: boolean }> = {
  // Le regala más prueba sin decir que pagó.
  extender: { estado: null, usaDias: true },
  // Pagó: se le suman los días Y pasa a 'active'.
  cobrado: { estado: "active", usaDias: true },
  // Deja de estar online: /<slug> no lo encuentra y /api/book lo rechaza.
  cortar: { estado: "vencido", usaDias: false },
  // Vuelve a estar online, en modo prueba.
  reactivar: { estado: "trial", usaDias: false },
};

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(iso));

export async function cambiarAcceso(_prev: Resultado, fd: FormData): Promise<Resultado> {
  const quien = await identificarAdmin();
  if (quien.estado !== "admin") return { ok: false, mensaje: "No autorizado." };

  const negocio = String(fd.get("negocio") ?? "");
  const accion = String(fd.get("accion") ?? "") as Movimiento;

  if (!UUID.test(negocio)) return { ok: false, mensaje: "Negocio inválido." };
  const mov = MOVIMIENTOS[accion];
  if (!mov) return { ok: false, mensaje: "Acción desconocida." };

  // El input de días es de texto libre: puede venir vacío, con letras o con un
  // número absurdo. Se limpia acá y la base lo vuelve a validar (±365).
  const pedidos = Math.trunc(Number(fd.get("dias")));
  const dias = mov.usaDias
    ? Math.min(365, Math.max(1, Number.isFinite(pedidos) && pedidos > 0 ? pedidos : 30))
    : 0;

  const { data, error } = await createAdminClient().rpc("admin_acceso", {
    negocio,
    dias,
    estado: mov.estado,
  });

  if (error) {
    console.error("admin_acceso:", error.code, error.message);
    return {
      ok: false,
      mensaje:
        error.code === "PGRST202"
          ? "Falta correr la migración 0013_admin_plataforma.sql."
          : "No se pudo guardar. Probá de nuevo.",
    };
  }

  const r = data as { ok: boolean; error?: string; slug?: string; estado?: string; vence?: string };
  if (!r?.ok) return { ok: false, mensaje: `La base rechazó el cambio (${r?.error ?? "sin detalle"}).` };

  // refresh() re-renderiza la página del server con los datos nuevos, sin que el
  // cliente tenga que volver a pedir la lista ni recargar a mano.
  refresh();

  const hasta = r.vence ? fecha(r.vence) : "—";
  return {
    ok: true,
    mensaje:
      accion === "cortar"
        ? `${r.slug} quedó fuera de línea.`
        : `${r.slug}: acceso hasta el ${hasta}${r.estado === "active" ? " · pagando" : ""}.`,
  };
}
