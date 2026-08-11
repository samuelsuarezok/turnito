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
let apptId = "";
let primeroId = "";
let dayIndex = -1;
let shopSlug = "";

test.use({ viewport: { width: 360, height: 780 } });

test.beforeAll(async () => {
  const shop = await getNegocio(admin);
  shopSlug = shop.slug;
  const { data: svc } = await admin.from("services").select("id").eq("business_id", shop.id).eq("active", true).limit(1).single();

  // Mismo criterio que reschedule.spec: día futuro VACÍO, para que el turno de
  // prueba sea el único y sea imposible cancelar uno ajeno.
  const { data: prox } = await admin.from("appointments")
    .select("date").eq("business_id", shop.id).gte("date", TODAY);
  const conTurnos = new Set((prox ?? []).map((a) => String(a.date)));

  for (let i = 1; i < 7; i++) {
    const ds = fmt(new Date(Date.now() + i * 86400000));
    if (!conTurnos.has(ds)) { dayIndex = i; break; }
  }
  if (dayIndex === -1) throw new Error("los próximos 6 días tienen turnos: no hay día seguro");

  const fecha = fmt(new Date(Date.now() + dayIndex * 86400000));

  // Hacen falta DOS turnos: el botón ✕ solo existe en los turnos que siguen,
  // no en la tarjeta del turno actual (ahí las acciones son Listo / No vino /
  // Mover). El primero ocupa el lugar de "actual" y cancelamos el segundo.
  const { data: p1, error: e1 } = await admin.from("appointments")
    .insert({
      business_id: shop.id, service_id: svc!.id, date: fecha, time: "10:00",
      client_name: "TEST primero", client_phone: "3512345678",
    })
    .select("id").single();
  if (e1) throw new Error(`no pude crear el primer turno: ${e1.message}`);
  primeroId = p1!.id;

  const { data, error } = await admin.from("appointments")
    .insert({
      business_id: shop.id, service_id: svc!.id, date: fecha, time: "11:00",
      client_name: "TEST cancelar", client_phone: "3512345678",
    })
    .select("id").single();
  if (error) throw new Error(`no pude crear el turno de prueba: ${error.message}`);
  apptId = data!.id;
});

test.afterAll(async () => {
  for (const id of [apptId, primeroId]) if (id) await admin.from("appointments").delete().eq("id", id);
});

test("cancelar un turno pide confirmación y ofrece avisarle al cliente", async ({ context, page }) => {
  await context.addCookies(cookies);
  await page.goto("/panel");

  const panelDays = page.locator("button.w-12");
  await panelDays.first().waitFor({ timeout: 20000 });
  await panelDays.nth(dayIndex).click();
  await expect(page.getByText("TEST cancelar")).toBeVisible({ timeout: 20000 });

  // RED DE SEGURIDAD: si hubiera más de un turno en el día, preferimos fallar
  // antes que cancelar uno ajeno.
  expect(await page.getByTitle("Cancelar turno").count(), "solo el segundo turno debe tener ✕ (el actual no lo tiene)").toBe(1);

  await page.getByTitle("Cancelar turno").click();
  const sheet = page.locator(".rounded-t-3xl");

  // 1. NO cancela de una: pide confirmación.
  //    Antes el ✕ cancelaba al toque y no había forma de deshacerlo.
  await expect(sheet.getByRole("heading", { name: "¿Cancelar el turno?" })).toBeVisible({ timeout: 10000 });

  const antes = await admin.from("appointments").select("status").eq("id", apptId).single();
  expect(antes.data!.status, "no debe cancelarse hasta confirmar").toBe("confirmed");

  // 2. "Mejor no" deja todo como estaba
  await sheet.getByRole("button", { name: "Mejor no" }).click();
  await expect(page.locator(".rounded-t-3xl")).toHaveCount(0, { timeout: 10000 });
  const trasCancelar = await admin.from("appointments").select("status").eq("id", apptId).single();
  expect(trasCancelar.data!.status, "'Mejor no' no debe tocar nada").toBe("confirmed");

  // 3. Ahora sí: confirmar
  await page.getByTitle("Cancelar turno").click();
  await sheet.getByRole("button", { name: "Sí, cancelar el turno" }).click();

  await expect(sheet.getByRole("heading", { name: "Turno cancelado" })).toBeVisible({ timeout: 10000 });

  const { data: fin } = await admin.from("appointments").select("status").eq("id", apptId).single();
  expect(fin!.status).toBe("cancelled_by_shop");

  // 4. El aviso: link con el mensaje escrito y, para un cancelado, apuntando a
  //    la página de reserva (su turno ya no existe; lo que necesita es sacar otro).
  const waBtn = sheet.getByRole("link", { name: "Avisarle por WhatsApp" });
  await expect(waBtn).toBeVisible();
  const href = decodeURIComponent((await waBtn.getAttribute("href")) ?? "");
  expect(href).toContain("wa.me/");
  expect(href).toContain("cancelar tu turno");
  expect(href, "el link debe llevar al slug real del negocio").toContain(`/${shopSlug}`);
  expect(href, "un cancelado NO debe mandar al link del turno").not.toContain("/t/");
  expect(href, "no debe quedar 'de el martes'").not.toContain("de el ");
});
