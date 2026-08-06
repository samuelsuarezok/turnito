// Rate limit por IP de la reserva pública.
//
// ALCANCE: solo el límite por IP. El cupo por negocio —la defensa central— NO
// vive acá: vive en un trigger de Postgres (0006_booking_caps_trigger.sql)
// justamente para que no pueda fallar abierto ni saltearse. Ver ese archivo.
//
// Si algún día el volumen justifica Redis, se reescribe este archivo y NADA
// más: el route handler solo consume checkIpLimit / recordAttempt.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const LIMITS = {
  ipPerHour: 5,
  ipPerDay: 10,
} as const;

export type Outcome = "booked" | "rate_limited" | "invalid" | "honeypot";

// Qué cuenta para el cupo. `invalid` queda AFUERA a propósito: si un cliente
// real se equivoca tres veces al tipear el teléfono, no se merece un bloqueo.
const COUNTED: Outcome[] = ["booked", "rate_limited", "honeypot"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Techo de filas a traer. Cualquier número por encima de los límites alcanza
// para bloquear, y así la query no crece sin control bajo ataque.
const FETCH_CAP = 200;

export type Verdict =
  | { ok: true }
  | { ok: false; reason: string; retryAfterSec: number };

/**
 * IP del cliente. `NextRequest.ip` fue REMOVIDO en Next 15
 * (ver node_modules/next/dist/docs/.../next-request.md), así que va por header.
 *
 * EL ORDEN DE PRIORIDAD NO ES COSMÉTICO — es lo que hace que el límite no se
 * pueda esquivar:
 *
 * `x-forwarded-for` lo puede mandar el cliente. Detrás de un proxy que
 * APPENDEA, el valor de la IZQUIERDA es el que puso el atacante y el real
 * queda a la derecha. Si tomás el primero, cualquiera saltea el límite
 * mandando `x-forwarded-for: 1.2.3.4` distinto en cada request.
 *
 * Por eso primero van los headers que ESCRIBE la plataforma (y por lo tanto
 * sobreescriben lo que mande el cliente), y `x-forwarded-for` queda como
 * último recurso tomando el valor de la DERECHA, que es el que agregó el
 * proxy más cercano.
 *
 * ⚠️ Esto asume que Vercel sobreescribe `x-real-ip`. Conviene confirmarlo en
 * su doc antes de dar el límite por IP por infalible. El cupo por negocio
 * (trigger de Postgres) no depende de nada de esto.
 */
export function clientIp(req: Request): string {
  const trusted =
    req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip");
  if (trusted?.trim()) return trusted.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    const closest = hops.at(-1);
    if (closest) return closest;
  }
  return "unknown";
}

/** Nunca guardamos la IP en claro: es dato personal. */
export function hashIp(ip: string): string {
  const salt =
    process.env.RATE_LIMIT_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

// ─── Self-check ─────────────────────────────────────────────────────────────
//
// El riesgo real del fail-open NO es que Supabase se caiga (si se cae, el
// lookup del negocio también falla y la reserva muere con un 404). El riesgo
// real es DESCONFIGURACIÓN: deployar sin correr la migración y quedar sin
// protección creyendo que la tenés. Silencioso, que es lo peor.
//
// Esto lo hace ruidoso. Una vez por instancia, no en cada request.
let selfCheckDone = false;

async function selfCheck(db: SupabaseClient): Promise<void> {
  if (selfCheckDone) return;
  selfCheckDone = true;

  // OJO: acá NO va `{ head: true }`. Con head:true PostgREST responde 204 sin
  // body y supabase-js devuelve error === null INCLUSO SI LA TABLA NO EXISTE.
  // O sea: el chequeo pasaba siempre y el aviso nunca saltaba. Verificado a
  // mano. Un select común sí propaga el error.
  const { error } = await db.from("booking_attempts").select("id").limit(1);

  if (error) {
    console.error(
      "\n" +
        "=".repeat(72) +
        "\n🔴 CRÍTICO: el rate limit por IP está INACTIVO." +
        `\n   La tabla booking_attempts no responde: ${error.message}` +
        "\n   Corré supabase/migrations/0005_booking_rate_limit.sql" +
        "\n   Las reservas siguen funcionando, pero SIN límite por IP." +
        "\n" +
        "=".repeat(72) +
        "\n"
    );
  }
}

type Counts = { hour: number; day: number };

async function windowCounts(
  db: SupabaseClient,
  ipHash: string
): Promise<Counts> {
  const { data, error } = await db
    .from("booking_attempts")
    .select("created_at")
    .eq("ip_hash", ipHash)
    .in("outcome", COUNTED)
    .gte("created_at", new Date(Date.now() - DAY).toISOString())
    .order("created_at", { ascending: false })
    .limit(FETCH_CAP);

  if (error) throw error;

  const rows = data ?? [];
  const hourAgo = Date.now() - HOUR;
  const times = rows.map((r) => new Date(r.created_at as string).getTime());

  return {
    hour: times.filter((t) => t >= hourAgo).length,
    day: times.length,
  };
}

/**
 * Límite por IP. FALLA ABIERTA a propósito, y acá sí es la decisión correcta:
 * esta es la capa SECUNDARIA. La defensa que no puede fallar —el cupo por
 * negocio— está en el trigger de Postgres, donde el fail-open es imposible.
 *
 * Un cliente real no debería quedarse sin reservar porque una tabla auxiliar
 * tuvo un hipo. Y si falla, el selfCheck grita en los logs.
 */
export async function checkIpLimit(
  db: SupabaseClient,
  ipHash: string
): Promise<Verdict> {
  await selfCheck(db);

  try {
    const c = await windowCounts(db, ipHash);

    if (c.hour >= LIMITS.ipPerHour) {
      return { ok: false, reason: "ip/hora", retryAfterSec: 3600 };
    }
    if (c.day >= LIMITS.ipPerDay) {
      return { ok: false, reason: "ip/día", retryAfterSec: 6 * 3600 };
    }
    return { ok: true };
  } catch (e) {
    console.error("[rate-limit] check de IP falló, dejo pasar:", (e as Error).message);
    return { ok: true };
  }
}

// Throttle del LOG de rechazos, por instancia.
//
// Sin throttle, un atacante infla la tabla a millones de filas y el log SE
// CONVIERTE en el ataque (te come el disco del free tier). Con throttle,
// guardamos como mucho un rechazo por IP por minuto.
//
// Va en memoria a propósito, y acá sí está bien: es una optimización
// best-effort. Que en Vercel cada instancia tenga su propio Map solo significa
// que se escriben algunas filas de más — nunca de menos. El LÍMITE en sí sigue
// viviendo en la tabla, que es lo que no puede ser lossy.
const ultimoRechazoLogueado = new Map<string, number>();
const THROTTLE_MS = 60_000;

/**
 * Registra el intento. Nunca tira: el log es una baranda, no el producto —
 * si falla, la reserva del cliente igual tiene que salir.
 */
export async function recordAttempt(
  db: SupabaseClient,
  args: {
    ipHash: string;
    businessId: string | null;
    outcome: Outcome;
  }
): Promise<void> {
  const { ipHash, businessId, outcome } = args;

  // El throttle mira el último RECHAZO, no el último intento.
  //
  // Antes comparaba contra `lastAt` (el último intento de cualquier tipo,
  // reservas exitosas incluidas). Resultado: si el atacante venía de reservar
  // bien, su primer bloqueo caía dentro de los 60s y NO se guardaba. En una
  // prueba real, 3 bloqueos seguidos dejaron 0 filas — justo el escenario que
  // el log tenía que capturar. El primer rechazo ahora SIEMPRE se guarda.
  const isRejection = outcome !== "booked";
  if (isRejection) {
    const prev = ultimoRechazoLogueado.get(ipHash);
    if (prev && Date.now() - prev < THROTTLE_MS) return;
    ultimoRechazoLogueado.set(ipHash, Date.now());

    // El Map no puede crecer sin control: un ataque con IPs rotativas lo
    // llenaría. Cuando se pasa, tiramos las entradas ya vencidas.
    if (ultimoRechazoLogueado.size > 5_000) {
      const corte = Date.now() - THROTTLE_MS;
      for (const [k, v] of ultimoRechazoLogueado) {
        if (v < corte) ultimoRechazoLogueado.delete(k);
      }
    }
  }

  try {
    const { error } = await db.from("booking_attempts").insert({
      ip_hash: ipHash,
      business_id: businessId,
      outcome,
    });
    if (error) throw error;
  } catch (e) {
    console.error("[rate-limit] no pude registrar el intento:", (e as Error).message);
  }
}
