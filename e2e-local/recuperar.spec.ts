import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(path.resolve(__dirname, "../.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

const BUZON = "real" + Date.now().toString().slice(-6);
const EMAIL = `${BUZON}@mailinator.com`;
const VIEJA = "ClaveVieja123!";
const NUEVA = "ClaveNueva456!";
const MI = "https://api.mailinator.com/api/v2/domains/public/inboxes";

test.use({ viewport: { width: 390, height: 850 } });

// Cubre la cadena completa: app -> Supabase -> Mailjet -> bandeja -> vuelta.
// Es el único test que verifica que un mail SALGA y LLEGUE, no que la API haya
// dicho que sí. Usa la API pública de mailinator para leer la bandeja.
//
// OJO con el flujo: el pedido TIENE que salir del navegador. @supabase/ssr usa
// PKCE y guarda el verificador en el browser que lo pide; si el pedido sale de
// Node, Supabase cae al flujo implícito, el link vuelve con el token en el hash
// y la página lo rechaza. Perdí un rato con eso: el test estaba mal, no el código.
test("recuperar contraseña como lo haría un usuario", async ({ page }) => {
  test.setTimeout(180000);

  await admin.auth.admin.createUser({ email: EMAIL, password: VIEJA, email_confirm: true });
  console.log("  usuario: " + EMAIL);

  // 1. El pedido sale DESDE EL NAVEGADOR. Esto importa: @supabase/ssr usa PKCE y
  //    guarda el verificador acá. Si el pedido saliera de otro lado, el link del
  //    mail no se puede canjear.
  await page.goto("/recuperar");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.getByRole("button", { name: /Mandame el link/ }).click();
  await expect(page.getByRole("heading", { name: "Revisá tu mail" })).toBeVisible({ timeout: 20000 });
  console.log("  1. pedido enviado desde el browser");

  // 2. Buscar el mail
  let link = "";
  for (let i = 0; i < 12 && !link; i++) {
    await page.waitForTimeout(5000);
    const inbox = await (await fetch(`${MI}/${BUZON}`)).json();
    const id = inbox.msgs?.[0]?.id;
    if (!id) continue;
    const msg = await (await fetch(`${MI}/${BUZON}/messages/${id}`)).json();
    const cuerpo: string = (msg.parts ?? []).map((p: { body?: string }) => p.body ?? "").join("\n");
    const urls: string[] = Array.from(new Set<string>(cuerpo.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? []));
    link = urls.find((u) => u.includes("/lnk/") && !u.includes("/oo/")) ?? "";
  }
  expect(link, "el mail tiene que llegar").toBeTruthy();
  console.log("  2. mail recibido");

  // 3. Abrir el link EN EL MISMO navegador, donde vive el verificador
  await page.goto(link, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  console.log("  3. aterrizo en: " + page.url().split("#")[0].split("?")[0]);
  await page.screenshot({ path: "e2e-local/shots/reset-form.png", fullPage: true });

  const campos = page.locator('input[type="password"]');
  const n = await campos.count();
  console.log("  4. campos de contraseña: " + n);
  expect(n, "un link válido tiene que mostrar el formulario").toBe(2);

  await campos.nth(0).fill(NUEVA);
  await campos.nth(1).fill(NUEVA);
  await page.getByRole("button", { name: /Guardar y entrar/ }).click();
  await page.waitForURL(/\/panel|\/onboarding/, { timeout: 30000 });
  console.log("  5. tras guardar: " + page.url());

  const nueva = await anon.auth.signInWithPassword({ email: EMAIL, password: NUEVA });
  console.log("  6. clave NUEVA: " + (nueva.data?.session ? "entra OK" : "FALLA — " + nueva.error?.message));
  expect(nueva.data?.session).toBeTruthy();

  const vieja = await anon.auth.signInWithPassword({ email: EMAIL, password: VIEJA });
  console.log("  7. clave VIEJA: " + (vieja.data?.session ? "TODAVIA ENTRA (mal)" : "rechazada OK"));
  expect(vieja.data?.session).toBeFalsy();
});

test.afterAll(async () => {
  const { data } = await admin.auth.admin.listUsers();
  const u = data.users.find((x) => x.email === EMAIL);
  if (u) await admin.auth.admin.deleteUser(u.id);
});
