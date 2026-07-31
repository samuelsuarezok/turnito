// Conexión directa a Postgres (Supabase). La usan introspect.mjs y migrate.mjs.
//
// Necesita SUPABASE_DB_URL en .env.local:
//   Supabase → Settings → Database → Connection string → URI
//
// .env.local está en .gitignore (`.env*`), así que la credencial no se commitea.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Parser mínimo de .env.local — evita sumar dotenv sólo para esto. */
export function loadEnv() {
  let raw;
  try {
    raw = readFileSync(path.join(ROOT, ".env.local"), "utf8");
  } catch {
    return {};
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    // Quita comillas envolventes si las hay.
    env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return env;
}

// Datos del Session pooler de este proyecto. NO son secretos: el ref
// (sepvrknmfekcufvmrpfz) ya viaja al browser dentro de
// NEXT_PUBLIC_SUPABASE_URL. Lo único secreto es el password.
const DEFAULTS = {
  host: "aws-1-sa-east-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "postgres.sepvrknmfekcufvmrpfz",
};

/**
 * Acepta dos formas:
 *   SUPABASE_DB_PASSWORD=...   ← preferida: el password va suelto y pg lo
 *                                manda tal cual, sin percent-encoding.
 *   SUPABASE_DB_URL=postgresql://...  ← si preferís la URL completa.
 */
export function getConfig() {
  const env = { ...loadEnv(), ...process.env };

  if (env.SUPABASE_DB_URL) {
    return { connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } };
  }

  if (!env.SUPABASE_DB_PASSWORD) {
    console.error(
      "\n✖ Falta el password de la base en .env.local\n\n" +
        "  Supabase → botón «Connect» (arriba) → Session pooler.\n" +
        "  Si no lo sabés: Settings → Database → Reset password.\n" +
        "  (Resetearlo no rompe Turnito: la app usa la API REST, no Postgres directo.)\n\n" +
        "  Agregá UNA línea a .env.local, con el password crudo — sin comillas,\n" +
        "  sin escapar nada, aunque tenga @ # / o ?:\n\n" +
        "      SUPABASE_DB_PASSWORD=tupasswordacá\n"
    );
    process.exit(1);
  }

  return {
    ...DEFAULTS,
    host: env.SUPABASE_DB_HOST || DEFAULTS.host,
    port: Number(env.SUPABASE_DB_PORT || DEFAULTS.port),
    database: env.SUPABASE_DB_NAME || DEFAULTS.database,
    user: env.SUPABASE_DB_USER || DEFAULTS.user,
    password: env.SUPABASE_DB_PASSWORD,
    // Supabase exige TLS. No verificamos la cadena porque el certificado es
    // de una CA propia de Supabase y no vale la pena distribuirla para esto.
    ssl: { rejectUnauthorized: false },
  };
}

export async function connect() {
  const client = new pg.Client(getConfig());
  await client.connect();
  return client;
}

export { ROOT };
