import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const cookies = JSON.parse(readFileSync(path.resolve(__dirname, ".auth.json"), "utf8"));
const shot = (n: string) => path.resolve(__dirname, "shots", n);

// Cargar .env en el worker (la config corre en otro proceso)
for (const line of readFileSync(path.resolve(__dirname, "../.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = fmt(new Date());
const TOMORROW = fmt(new Date(Date.now() + 86400000));
let apptId = "";

test.use({ viewport: { width: 360, height: 780 } });

// Índice del día elegido dentro de las pills del panel (0 = hoy).
let dayIndex = -1;

test.beforeAll(async () => {
  const { data: shop } = await admin.from("businesses").select("id").eq("slug", "barberia-samuel").single();
  const { data: svc } = await admin.from("services").select("id").eq("business_id", shop!.id).eq("active", true).limit(1).single();

  // ATENCIÓN — POR QUÉ ESTE TEST NO USA HOY.
  //
  // El botón "Mover a otro horario" existe SOLO en la tarjeta del turno actual,
  // que es el primer confirmado del día. La versión anterior insertaba el turno
  // de prueba en HOY y después hacía getByText("Mover a otro horario").click()
  // asumiendo que era el suyo. Cuando el día ya tenía turnos, el actual era
  // OTRO y el test movía un turno ajeno: modificaba datos reales.
  //
  // Solución: buscamos un día futuro (dentro de las 7 pills del panel) que esté
  // VACÍO. Ahí el turno de prueba es el único, así que es siempre el actual y no
  // hay forma de tocar nada que no sea nuestro.
  const { data: prox } = await admin.from("appointments")
    .select("date").eq("business_id", shop!.id).gte("date", TODAY);
  const conTurnos = new Set((prox ?? []).map((a) => String(a.date)));

  for (let i = 1; i < 7; i++) {                      // desde 1: hoy nunca
    const ds = fmt(new Date(Date.now() + i * 86400000));
    if (!conTurnos.has(ds)) { dayIndex = i; break; }
  }
  if (dayIndex === -1) throw new Error("los próximos 6 días tienen turnos: no hay día seguro para el test");

  const targetDate = fmt(new Date(Date.now() + dayIndex * 86400000));

  const { data, error } = await admin.from("appointments")
    .insert({ business_id: shop!.id, service_id: svc!.id, date: targetDate, time: "12:00", client_name: "TEST reprogramar", client_phone: "000" })
    .select("id").single();
  // El error se chequea explícitamente: antes se ignoraba y el fallo salía como
  // un TypeError críptico dos líneas después, sin decir qué había pasado.
  if (error) throw new Error(`no pude crear el turno de prueba (${targetDate} 12:00): ${error.message}`);
  apptId = data!.id;
});

test.afterAll(async () => { if (apptId) await admin.from("appointments").delete().eq("id", apptId); });

test("Tarea 5: mover un turno a otro día desde el panel", async ({ context, page }) => {
  await context.addCookies(cookies);
  await page.goto("/panel");

  // Ir al día vacío donde pusimos el turno (las pills del panel: 0 = hoy).
  const panelDays = page.locator("button.w-12");
  await panelDays.first().waitFor({ timeout: 20000 });
  await panelDays.nth(dayIndex).click();

  await expect(page.getByText("TEST reprogramar")).toBeVisible({ timeout: 20000 });

  // RED DE SEGURIDAD: el botón "Mover a otro horario" está solo en la tarjeta
  // del turno actual. Si por lo que sea apareciera más de uno, o el día tuviera
  // otros turnos, preferimos FALLAR acá antes que mover un turno ajeno.
  const moveBtn = page.getByText("Mover a otro horario");
  expect(await moveBtn.count(), "debería haber exactamente 1 botón de mover (el turno de prueba)").toBe(1);
  expect(await page.getByText("TEST reprogramar").count(), "el día elegido debería tener solo el turno de prueba").toBe(1);

  // Abrir el modal de reprogramar
  await moveBtn.click();
  const sheet = page.locator(".rounded-t-3xl");
  await sheet.getByRole("heading", { name: "Mover turno" }).waitFor();
  const dayPills = sheet.locator("button.w-12");
  await dayPills.first().waitFor({ timeout: 15000 }); // día pills cargados

  // Recorrer los días hasta encontrar uno con horarios libres (samuel cierra dom/lun)
  const freeSlots = sheet.locator(".grid button:not([disabled])");
  const nDays = await dayPills.count();
  let found = false;
  for (let i = 0; i < nDays; i++) {
    await dayPills.nth(i).click();
    await page.waitForTimeout(500);
    if (await freeSlots.count() > 0) { found = true; break; }
  }
  expect(found).toBeTruthy();
  await sheet.screenshot({ path: shot("reschedule-modal.png") });

  const chosen = (await freeSlots.first().textContent())?.trim();
  await freeSlots.first().click();
  await sheet.getByRole("button", { name: /Mover a/ }).click();

  // El modal se cierra
  await expect(page.locator(".rounded-t-3xl")).toHaveCount(0, { timeout: 10000 });

  // Verificar en la base que el turno se movió al horario elegido
  const { data: moved } = await admin.from("appointments").select("date, time").eq("id", apptId).single();
  expect(moved!.time.slice(0, 5)).toBe(chosen);
});
