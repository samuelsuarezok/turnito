import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { getNegocio } from "./negocio";

const cookies = JSON.parse(readFileSync(path.resolve(__dirname, ".auth.json"), "utf8"));
for (const line of readFileSync(path.resolve(__dirname, "../.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = fmt(new Date());
const ids: string[] = [];
let dayIndex = -1;

test.use({ viewport: { width: 360, height: 780 } });

test.beforeAll(async () => {
  const shop = await getNegocio(admin);
  const { data: svc } = await admin.from("services").select("id").eq("business_id", shop.id).eq("active", true).limit(1).single();

  const { data: prox } = await admin.from("appointments").select("date").eq("business_id", shop.id).gte("date", TODAY);
  const conTurnos = new Set((prox ?? []).map((a) => String(a.date)));
  for (let i = 1; i < 7; i++) {
    const ds = fmt(new Date(Date.now() + i * 86400000));
    if (!conTurnos.has(ds)) { dayIndex = i; break; }
  }
  if (dayIndex === -1) throw new Error("no hay día libre en los próximos 6");
  const fecha = fmt(new Date(Date.now() + dayIndex * 86400000));

  // Dos turnos: uno cae en la tarjeta "siguiente" y otro en la lista de abajo.
  // El recordatorio tiene que estar en los dos lugares.
  for (const [time, name] of [["10:00", "TEST recordar uno"], ["11:00", "TEST recordar dos"]]) {
    const { data, error } = await admin.from("appointments")
      .insert({ business_id: shop.id, service_id: svc!.id, date: fecha, time, client_name: name, client_phone: "3512345678" })
      .select("id").single();
    if (error) throw new Error(`no pude crear ${name}: ${error.message}`);
    ids.push(data!.id);
  }
});

test.afterAll(async () => { for (const id of ids) await admin.from("appointments").delete().eq("id", id); });

test("se puede recordar el turno por WhatsApp desde las dos tarjetas", async ({ context, page }) => {
  await context.addCookies(cookies);
  await page.goto("/panel");
  const pills = page.locator("button.w-12");
  await pills.first().waitFor({ timeout: 20000 });
  await pills.nth(dayIndex).click();
  await expect(page.getByText("TEST recordar uno")).toBeVisible({ timeout: 20000 });

  // 1. Tarjeta SIGUIENTE
  const enSiguiente = page.getByRole("link", { name: "🔔 Recordarle" });
  await expect(enSiguiente).toBeVisible();
  const h1 = decodeURIComponent((await enSiguiente.getAttribute("href")) ?? "");
  expect(h1).toContain("wa.me/");
  expect(h1).toContain("Te recuerdo tu turno");
  expect(h1).toContain("/t/");                       // link para cancelar solo
  expect(h1).toContain("así libero el horario");     // el pedido explícito
  expect(h1).not.toContain("de el ");                // gramática

  // 2. Tarjeta de la lista de abajo
  const enLista = page.getByTitle("Recordarle el turno");
  await expect(enLista).toHaveCount(1);
  const h2 = decodeURIComponent((await enLista.getAttribute("href")) ?? "");
  expect(h2).toContain("Te recuerdo tu turno");
  expect(h2).toContain("11:00");                     // el horario de ESE turno, no el del otro
  expect(h1).toContain("10:00");
});
