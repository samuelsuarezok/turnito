// Vuelca el schema real de Supabase a supabase/schema.snapshot.sql
//
//   node scripts/introspect.mjs
//
// El schema base de Turnito se creó a mano en el panel de Supabase y nunca
// estuvo versionado: sólo hay migraciones incrementales. Este script deja una
// foto legible en el repo, para poder escribir migraciones sin adivinar.
// SÓLO LEE. No modifica nada.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { connect, ROOT } from "./db.mjs";

const QUERIES = [
  [
    "FUNCIONES",
    `select pg_get_functiondef(p.oid) as ddl
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by p.proname`,
  ],
  [
    "CONSTRAINTS",
    `select format('alter table %s add constraint %I %s;',
                   conrelid::regclass, conname, pg_get_constraintdef(oid)) as ddl
     from pg_constraint
     where connamespace = 'public'::regnamespace and contype in ('c','u','f','p')
     order by conrelid::regclass::text, conname`,
  ],
  [
    "INDICES",
    `select indexdef || ';' as ddl from pg_indexes
     where schemaname = 'public' order by tablename, indexname`,
  ],
  [
    "RLS POLICIES",
    `select format('-- %s.%s (%s, roles: %s)%s  USING %s%s',
                   schemaname, tablename, cmd, array_to_string(roles, ','),
                   chr(10), coalesce(qual, '-'),
                   coalesce(chr(10) || '  WITH CHECK ' || with_check, '')) as ddl
     from pg_policies where schemaname = 'public'
     order by tablename, policyname`,
  ],
  [
    "TRIGGERS",
    `select format('-- %s on %s: %s', t.tgname, t.tgrelid::regclass, pg_get_triggerdef(t.oid)) as ddl
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
     order by t.tgname`,
  ],
  [
    "EVENT TRIGGERS",
    `select format('-- %s: %s %s -> %s()', evtname, evtevent, evtenabled, p.proname) as ddl
     from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid
     order by evtname`,
  ],
  [
    "COLUMNAS",
    `select format('-- %s.%s %s%s%s', table_name, column_name, data_type,
                   case when is_nullable = 'NO' then ' NOT NULL' else '' end,
                   coalesce(' DEFAULT ' || column_default, '')) as ddl
     from information_schema.columns
     where table_schema = 'public'
     order by table_name, ordinal_position`,
  ],
];

const client = await connect();
const out = [
  "-- ════════════════════════════════════════════════════════════════════",
  "-- FOTO DEL SCHEMA — generada por scripts/introspect.mjs",
  `-- ${new Date().toISOString()}`,
  "--",
  "-- NO se corre. Es documentación: el schema base de Turnito vive en",
  "-- Supabase y no estaba versionado. Regenerá con:",
  "--     node scripts/introspect.mjs",
  "-- ════════════════════════════════════════════════════════════════════",
];

for (const [titulo, sql] of QUERIES) {
  const { rows } = await client.query(sql);
  out.push(
    "",
    `-- ══════════════════ ${titulo} (${rows.length}) ══════════════════`,
    ""
  );
  for (const r of rows) out.push(r.ddl, "");
  console.log(`  ${titulo}: ${rows.length}`);
}

await client.end();

const dest = path.join(ROOT, "supabase", "schema.snapshot.sql");
writeFileSync(dest, out.join("\n"), "utf8");
console.log(`\n✓ Escrito en supabase/schema.snapshot.sql`);
