import { test } from "@playwright/test";
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
const shot = (name: string) => path.resolve(__dirname, "shots", name);

test.use({ viewport: { width: 360, height: 780 } }); // mobile real (tarea 6)

test("screenshots mobile 360px", async ({ context, page }) => {
  await context.addCookies(cookies);

  // PANEL (skeleton → contenido)
  await page.goto("/panel");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: shot("panel.png"), fullPage: true });

  // PANEL estado vacío (tarea 9): click al último día (suele estar sin turnos)
  try {
    await page.locator(".overflow-x-auto button").last().click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: shot("panel-empty.png"), fullPage: true });
  } catch (e) { console.log("no pude forzar empty state:", (e as Error).message); }

  // CONFIG + toast de guardado (tarea 8)
  await page.goto("/panel/config");
  await page.getByRole("heading", { name: "Horarios" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Guardar" }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("config-toast.png"), fullPage: true });

  // RESERVA pública (mobile)
  // El slug NO se hardcodea: el producto tiene una feature para cambiarlo.
  const { slug } = await getNegocio(admin);
  await page.goto(`/${slug}`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: shot("booking.png"), fullPage: true });
});
