// AUDITORIA DE AISLAMIENTO MULTI-TENANT
// Uso: node --env-file=.env e2e-local/audit-rls.mjs
//
// Crea un negocio B de prueba con otro dueno y verifica que NO pueda leer ni
// escribir nada del negocio A. Borra todo en el finally. Las pruebas de
// escritura van contra un turno descartable creado por el script: nunca toca
// turnos reales.
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL_, SVC, { auth: { persistSession: false } });

const EMAIL_B = "rls-test-b@example.com";
let userB = null, bizB = null, testAppt = null;
const ok = (c) => (c ? "✅" : "🔴");

try {
  // ── Setup ────────────────────────────────────────────────────────────────
  const { data: bizA } = await admin
    .from("businesses").select("id, name, slug, owner_id").limit(1).single();
  console.log(`negocio A (real): ${bizA.name}  [${bizA.slug}]`);

  const { data: svcA } = await admin
    .from("services").select("id").eq("business_id", bizA.id).limit(1).single();

  // Turno descartable EN EL NEGOCIO A, contra el que probamos escritura.
  const d = new Date(); d.setDate(d.getDate() + 45);
  const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const { data: appt, error: apptErr } = await admin.from("appointments").insert({
    business_id: bizA.id, service_id: svcA.id, date, time: "23:47",
    client_name: "RLS-TEST descartable", client_phone: "0000000000",
  }).select("id, client_name").single();
  if (apptErr) throw new Error("no pude crear el turno de prueba: " + apptErr.message);
  testAppt = appt;
  console.log(`turno descartable en A: ${testAppt.id}`);

  // Usuario B + negocio B
  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email: EMAIL_B, email_confirm: true,
  });
  if (uErr && !/already/i.test(uErr.message)) throw uErr;
  if (created?.user) userB = created.user;
  else {
    const { data: list } = await admin.auth.admin.listUsers();
    userB = list.users.find((u) => u.email === EMAIL_B);
  }
  console.log(`usuario B: ${userB.id}`);

  const { data: nb, error: bErr } = await admin.from("businesses").insert({
    owner_id: userB.id, name: "RLS TEST BIZ", slug: "rls-test-biz-" + userB.id.slice(0, 8),
    subscription_status: "trial", whatsapp: "5493510000000",
  }).select("id, slug").single();
  if (bErr) throw new Error("no pude crear el negocio B: " + bErr.message);
  bizB = nb;
  console.log(`negocio B: ${bizB.slug}\n`);

  // ── Login como B ─────────────────────────────────────────────────────────
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL_B });
  const sess = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: s, error: sErr } = await sess.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: "email",
  });
  if (sErr || !s.session) throw new Error("no pude loguear a B: " + sErr?.message);
  console.log("logueado como dueño B\n");

  console.log("===== ¿B puede LEER lo de A? =====");

  const { data: bizSeen } = await sess.from("businesses").select("id, name, slug");
  const veAjeno = (bizSeen ?? []).some((b) => b.id === bizA.id);
  console.log(`  ${ok(!veAjeno)} businesses     B ve ${bizSeen?.length ?? 0} negocio(s)` +
    (veAjeno ? "  ← VE EL NEGOCIO DE A" : "  (solo el suyo)"));

  const { data: apptSeen } = await sess.from("appointments").select("id, client_name, client_phone, business_id");
  const ajenos = (apptSeen ?? []).filter((a) => a.business_id !== bizB.id);
  console.log(`  ${ok(ajenos.length === 0)} appointments   B ve ${apptSeen?.length ?? 0} turno(s), ${ajenos.length} ajenos` +
    (ajenos.length ? `  ← FUGA DE PII: ${ajenos[0].client_name} / ${ajenos[0].client_phone}` : ""));

  for (const t of ["services", "staff", "closed_dates", "opening_hours"]) {
    const { data: rows, error } = await sess.from(t).select("*");
    if (error) { console.log(`  ✅ ${t.padEnd(14)} bloqueado (${error.code})`); continue; }
    const aj = (rows ?? []).filter((r) => r.business_id && r.business_id !== bizB.id);
    console.log(`  ${ok(aj.length === 0)} ${t.padEnd(14)} B ve ${rows?.length ?? 0} fila(s), ${aj.length} ajenas`);
  }

  console.log("\n===== ¿B puede ESCRIBIR sobre lo de A? =====");

  const { data: upd } = await sess.from("appointments")
    .update({ client_name: "HACKEADO POR B" }).eq("id", testAppt.id).select("id");
  const pudoUpdate = (upd ?? []).length > 0;
  console.log(`  ${ok(!pudoUpdate)} UPDATE turno de A   ${pudoUpdate ? "← LO MODIFICÓ" : "rechazado"}`);

  const { data: del } = await sess.from("appointments").delete().eq("id", testAppt.id).select("id");
  const pudoDelete = (del ?? []).length > 0;
  console.log(`  ${ok(!pudoDelete)} DELETE turno de A   ${pudoDelete ? "← LO BORRÓ" : "rechazado"}`);
  if (pudoDelete) testAppt = null;

  const { data: updBiz } = await sess.from("businesses")
    .update({ name: "HACKEADO" }).eq("id", bizA.id).select("id");
  const pudoBiz = (updBiz ?? []).length > 0;
  console.log(`  ${ok(!pudoBiz)} UPDATE negocio A    ${pudoBiz ? "← LO MODIFICÓ" : "rechazado"}`);

  // Verificación final contra la base real
  if (testAppt) {
    const { data: real } = await admin.from("appointments").select("client_name").eq("id", testAppt.id).maybeSingle();
    console.log(`\n  estado real del turno: "${real?.client_name ?? "(borrado)"}"`);
  }
  const { data: realBiz } = await admin.from("businesses").select("name").eq("id", bizA.id).single();
  console.log(`  estado real del negocio A: "${realBiz.name}"`);

} catch (e) {
  console.error("\n✖ ERROR:", e.message);
} finally {
  console.log("\n===== LIMPIEZA =====");
  if (testAppt) {
    await admin.from("appointments").delete().eq("id", testAppt.id);
    console.log("  turno de prueba borrado");
  }
  if (bizB) { await admin.from("businesses").delete().eq("id", bizB.id); console.log("  negocio B borrado"); }
  if (userB) { await admin.auth.admin.deleteUser(userB.id); console.log("  usuario B borrado"); }
  const { count } = await admin.from("appointments").select("*", { count: "exact", head: false }).limit(0);
  console.log(`  turnos en la base: ${count} (deben ser 33)`);
}
