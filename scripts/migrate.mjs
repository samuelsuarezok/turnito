// Corre una migración dentro de UNA transacción.
//
//   node scripts/migrate.mjs supabase/migrations/0004_rename.sql
//   node scripts/migrate.mjs supabase/migrations/0004_rename.sql --dry
//
// --dry corre todo y hace ROLLBACK: sirve para ver si el SQL pasa sin dejar
// nada tocado. Es la forma de probar un rename grande sin riesgo.
//
// Si algo falla en el medio, la transacción entera se revierte: la base nunca
// queda a mitad de camino. (Ojo: unas pocas sentencias no son transaccionales
// en Postgres, como CREATE INDEX CONCURRENTLY. Acá no usamos ninguna.)

import { readFileSync } from "node:fs";
import path from "node:path";
import { connect, ROOT } from "./db.mjs";

const file = process.argv[2];

// Se mira por los dos lados, y no es por prolijidad:
//
//   npm run db:migrate archivo.sql --dry
//
// NO le pasa el flag al script. npm se queda con todo lo que empieza con `--`,
// lo interpreta como config propia (`--dry` lo abrevia a `--dry-run`) y lo deja
// en `npm_config_dry_run`. O sea que la forma que documentaba el README llegaba
// acá SIN --dry y APLICABA la migración en producción creyendo que la ensayaba.
// Pasó de verdad, con la 0013.
//
// `node scripts/migrate.mjs archivo.sql --dry` (sin npm) sí llega por argv.
const dry =
  process.argv.includes("--dry") ||
  process.env.npm_config_dry_run === "true" ||
  process.env.npm_config_dry === "true";

if (!file) {
  console.error("Uso: node scripts/migrate.mjs <archivo.sql> [--dry]");
  process.exit(1);
}

const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
const sql = readFileSync(abs, "utf8");

const client = await connect();
console.log(`\n▸ ${path.relative(ROOT, abs)}${dry ? "  (DRY RUN — revierte al final)" : ""}\n`);

// Los NOTICE de los bloques DO son el log de la migración: mostrarlos.
client.on("notice", (n) => console.log("  " + (n.message ?? "").trim()));

try {
  await client.query("begin");
  await client.query(sql);

  if (dry) {
    await client.query("rollback");
    console.log("\n✓ El SQL corre limpio. Revertido: la base quedó igual que antes.");
  } else {
    await client.query("commit");
    console.log("\n✓ Aplicada y commiteada.");
  }
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error(`\n✖ Falló — se revirtió todo, la base quedó intacta.\n`);
  console.error(`  ${err.message}`);
  if (err.detail) console.error(`  detalle: ${err.detail}`);
  if (err.hint) console.error(`  hint: ${err.hint}`);
  if (err.where) console.error(`  en: ${err.where}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
