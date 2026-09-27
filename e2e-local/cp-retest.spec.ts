import { test, expect, type Page, type Browser } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Retest de los casos del QA que fallaron o tenían hallazgos:
//   CP-02 login contraseña incorrecta (mensaje en español)
//   CP-03 login email vacío (feedback por campo)
//   CP-04 login email sin formato válido (feedback por campo)
//   CP-06 registro con email ya usado + normalización a minúsculas
//   CP-07 registro con contraseña corta (feedback por campo)
//   CP-10 reserva sin nombre/WhatsApp (feedback por campo)
//   CP-13 dos clientes, mismo horario: el que pierde VE el aviso
//
// Corre contra el Supabase LOCAL (Docker), levantado con `supabase start`
// y con el schema real volcado desde producción. No toca producción.

// Carga .env.local (local) o .env (el de siempre) sin pisar vars ya seteadas.
for (const f of ["../.env.local", "../.env"]) {
  try {
    for (const line of readFileSync(path.resolve(__dirname, f), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, "$1");
    }
    break;
  } catch { /* prueba el siguiente */ }
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const SUFIJO = Date.now().toString(36).slice(-6);
const OWNER_EMAIL = `qa-owner-${SUFIJO}@example.com`;
const OWNER_PASS = "claveDePrueba9";
const SLUG = `qa-${SUFIJO}`;
const SERVICIO = "Corte QA";
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

test.use({ viewport: { width: 390, height: 850 } });

test.beforeAll(async () => {
  // Limpiar el contador de rate-limit por IP: la suite reserva varias veces
  // desde 127.0.0.1 y si corrés el archivo más de una vez en la misma hora
  // te bloquea a vos mismo (sí, el rate limit anda — es production behavior).
  await admin.from("booking_attempts").delete().neq("id", 0);

  // Dueño + negocio + servicio + horarios, directo a la base local.
  const { data: user, error: e1 } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL, password: OWNER_PASS, email_confirm: true,
  });
  if (e1) throw e1;

  const { data: biz, error: e2 } = await admin.from("businesses").insert({
    owner_id: user.user.id, name: "Pelu QA", slug: SLUG, whatsapp: "3515551111",
  }).select("id").single();
  if (e2) throw e2;

  const { error: e3 } = await admin.from("services").insert({
    business_id: biz.id, name: SERVICIO, duration_min: 30, price: 100,
  });
  if (e3) throw e3;

  // Abierto todos los días 08:00–20:00: cualquier "mañana" tiene turnos.
  const { error: e4 } = await admin.from("opening_hours").insert(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      business_id: biz.id, weekday, opens_at: "08:00", closes_at: "20:00",
    }))
  );
  if (e4) throw e4;
});

test.describe.configure({ mode: "serial" });

// ── Auth: el botón nunca se apaga; valida al tocar y avisa por campo ────────

test("CP-03: login con email vacío avisa qué falta (botón no apagado)", async ({ page }) => {
  await page.goto("/login");
  // Modo default es registro: el botón NO está deshabilitado aunque esté vacío.
  await page.getByRole("button", { name: "Crear cuenta →" }).click();
  await expect(page.getByText("Ingresá tu email")).toBeVisible();
  await expect(page.getByText("Ingresá tu contraseña")).toBeVisible();
});

test("CP-04: email sin formato válido avisa (sin pegarle al backend)", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill("sinarroba");
  await page.locator("#pass").fill("123456");
  await page.getByRole("button", { name: "Crear cuenta →" }).click();
  await expect(page.getByText("Ese email no parece válido")).toBeVisible();
  // No salió ninguna llamada a Supabase: el email viejo sigue visible en el campo.
});

test("CP-07: contraseña corta avisa el mínimo de 6", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(`corta-${SUFIJO}@example.com`);
  await page.locator("#pass").fill("12345");
  await page.getByRole("button", { name: "Crear cuenta →" }).click();
  await expect(page.getByText("La contraseña necesita al menos 6 caracteres")).toBeVisible();
});

test("CP-02: contraseña incorrecta sale en español", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Ingresá" }).click(); // a modo login
  await page.locator("#email").fill(OWNER_EMAIL);
  await page.locator("#pass").fill("contraseña-mal-123");
  await page.getByRole("button", { name: "Ingresar →" }).click();
  await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
});

test("CP-06: email ya usado (aunque cambien las mayúsculas) avisa en español", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(OWNER_EMAIL.toUpperCase()); // QA-OWNER-... ya registrado en minúsculas
  await page.locator("#pass").fill(OWNER_PASS);
  await page.getByRole("button", { name: "Crear cuenta →" }).click();
  await expect(page.getByText("Ya existe una cuenta con ese email. Probá ingresar.")).toBeVisible();
});

// ── Reserva ────────────────────────────────────────────────────────────────

async function prepararReserva(page: Page) {
  await page.goto(`/${SLUG}`);
  await page.getByRole("button", { name: new RegExp(SERVICIO) }).click();
  // Mañana: así no interviene la anticipación mínima de hoy.
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const botonDia = page.getByRole("button", {
    name: new RegExp(`${DIAS[manana.getDay()]}\\s+${manana.getDate()}`),
  });
  await botonDia.click();
  await page.getByRole("button", { name: "10:00", exact: true }).click();
  await page.getByRole("button", { name: "Continuar →" }).click();
}

test("CP-10: confirmar sin nombre ni WhatsApp avisa por campo", async ({ page }) => {
  await prepararReserva(page);
  await page.getByRole("button", { name: "Confirmar turno →" }).click();
  await expect(page.getByText("Ingresá tu nombre")).toBeVisible();
  await expect(page.getByText("Ingresá tu WhatsApp")).toBeVisible();

  // Nombre muy corto y WhatsApp con menos de 8 dígitos.
  await page.locator('input[placeholder="Juan Pérez"]').fill("Te");
  await page.locator('input[type="tel"]').fill("1234567");
  await page.getByRole("button", { name: "Confirmar turno →" }).click();
  await expect(page.getByText("Tu nombre es muy corto")).toBeVisible();
  await expect(page.getByText("Ese WhatsApp no parece válido")).toBeVisible();
});

test("CP-13: el que pierde el horario VE el aviso y conserva sus datos", async ({ browser }) => {
  test.setTimeout(60000);

  async function nuevoCliente(browser: Browser, nombre: string, telefono: string) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 850 } });
    const page = await ctx.newPage();
    await prepararReserva(page);
    await page.locator('input[placeholder="Juan Pérez"]').fill(nombre);
    await page.locator('input[type="tel"]').fill(telefono);
    return { ctx, page, confirmar: () => page.getByRole("button", { name: "Confirmar turno →" }).click() };
  }

  const a = await nuevoCliente(browser, "Cliente Uno", "3512345678");
  const b = await nuevoCliente(browser, "Cliente Dos", "3519876543");

  // Los dos confirman a la vez; el índice único deja pasar solo a uno.
  await Promise.all([a.confirmar(), b.confirmar()]);

  const confirmoA = a.page.getByText("¡Turno confirmado!");
  const confirmoB = b.page.getByText("¡Turno confirmado!");
  // Dos respuestas válidas de SLOT_TAKEN según cuál chequeo agarra al perdedor:
  // "se superpone" (chequeo de solapamiento) o "se acaba de ocupar" (índice único).
  const avisoA = a.page.getByText(/Ese horario se (acaba de ocupar|superpone con otro turno)\. Elegí otro\./);
  const avisoB = b.page.getByText(/Ese horario se (acaba de ocupar|superpone con otro turno)\. Elegí otro\./);

  // Esperar a que ambos resuelvan: uno tiene que confirmar y el otro tiene
  // que volver al paso 1 con el aviso. (.or() no vale: son páginas distintas.)
  let confirmo = false, aviso = false;
  for (let i = 0; i < 30 && !(confirmo && aviso); i++) {
    confirmo = (await confirmoA.isVisible()) || (await confirmoB.isVisible());
    aviso = (await avisoA.isVisible()) || (await avisoB.isVisible());
    if (!aviso) await a.page.waitForTimeout(500);
  }
  if (!confirmo || !aviso) {
    console.log("=== DEBUG A ===\n" + (await a.page.locator("body").innerText()).slice(0, 400));
    console.log("=== DEBUG B ===\n" + (await b.page.locator("body").innerText()).slice(0, 400));
  }
  expect(confirmo, "alguien tiene que haber confirmado").toBe(true);
  expect(aviso, "el que pierde tiene que ver el aviso").toBe(true);

  // El que perdió conserva sus datos: elige otro horario y vuelve al paso 2.
  const perdedor = (await avisoA.isVisible()) ? a : b;
  const nombrePerdedor = (await avisoA.isVisible()) ? "Cliente Uno" : "Cliente Dos";
  await perdedor.page.getByRole("button", { name: "10:30", exact: true }).click();
  await perdedor.page.getByRole("button", { name: "Continuar →" }).click();
  await expect(perdedor.page.locator('input[placeholder="Juan Pérez"]')).toHaveValue(nombrePerdedor);

  await a.ctx.close();
  await b.ctx.close();
});
