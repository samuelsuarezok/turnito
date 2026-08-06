import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Cookies de sesión generadas por gen-auth.mjs (usuario samuel, que TIENE barbería).
const cookies = JSON.parse(readFileSync(path.resolve(__dirname, ".auth.json"), "utf8"));

test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

test("Tarea 2: usuario con barbería en /onboarding → redirige a /panel", async ({ page }) => {
  await page.goto("/onboarding");
  // El guard debe sacarlo del onboarding y mandarlo al panel.
  await page.waitForURL("**/panel", { timeout: 20000 });
  expect(page.url()).toContain("/panel");
});

test("Tarea 3: '+ Agregar franja' agrega un rango horario en Config", async ({ page }) => {
  await page.goto("/panel/config");
  // Si la sesión no fuese válida, esto redirige a /login y falla → también valida el auth.
  await expect(page.getByRole("heading", { name: "Horarios" })).toBeVisible({ timeout: 20000 });

  // El heading aparece antes que los horarios (se cargan async), así que hay que
  // esperar a que las franjas estén en el DOM: si no, el conteo de abajo lee 0 y
  // el test falla por una race, no por un bug real.
  const addBtn = page.getByRole("button", { name: /Agregar franja/ }).first();
  await addBtn.waitFor({ state: "visible", timeout: 20000 });

  const removeBtns = page.locator('[title="Quitar franja"]');
  const start = await removeBtns.count();

  // Contra qué comparar: NO se puede asumir "start + 2".
  // Un día con 1 franja no muestra ningún "Quitar"; con 2 muestra 2; con 3
  // muestra 3. O sea que el salto depende de cuántas franjas tenga YA el día
  // que tocamos, y eso es dato de la base que este test no controla (desde
  // horarios partidos hay días con más de una).
  // Lo que sí es invariante: agregar una franja aumenta la cantidad de "Quitar".
  await addBtn.click();
  await expect.poll(() => removeBtns.count(), { timeout: 10000 }).toBeGreaterThan(start);
});
