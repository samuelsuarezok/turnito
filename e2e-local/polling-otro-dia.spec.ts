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
let apptId = "";

test.afterAll(async () => { if (apptId) await admin.from("appointments").delete().eq("id", apptId); });

test("polling parado en OTRO día (no hoy)", async ({ context, page }) => {
  test.setTimeout(45000);
  const OPEN = new Set([2, 3, 4, 5, 6]); // samuel abre mar-sáb
  // primer día futuro (offset 1..6) que samuel abre
  let offset = 1;
  while (offset <= 6 && !OPEN.has(new Date(Date.now() + offset * 86400000).getDay())) offset++;
  const target = new Date(Date.now() + offset * 86400000);
  const TARGET_DATE = fmt(target);

  await context.addCookies(cookies);
  await page.goto("/panel");
  await page.waitForTimeout(2000);

  // Pararse en el día futuro (click en el pill correspondiente)
  await page.locator(".overflow-x-auto").first().locator("button").nth(offset).click();
  await page.waitForTimeout(1000);
  await expect(page.getByText("POLLING-OTRODIA")).toHaveCount(0);

  // Insertar turno para ESE día (sin recargar)
  const shop = await getNegocio(admin);
  const { data: svc } = await admin.from("services").select("id").eq("business_id", shop.id).eq("active", true).limit(1).single();
  const { data } = await admin.from("appointments")
    .insert({ business_id: shop.id, service_id: svc!.id, date: TARGET_DATE, time: "10:00", client_name: "POLLING-OTRODIA", client_phone: "000" })
    .select("id").single();
  apptId = data!.id;
  console.log("Insertado para", TARGET_DATE, "(offset", offset + ")");

  // El polling debe traerlo SIN cambiar de día
  await expect(page.getByText("POLLING-OTRODIA")).toBeVisible({ timeout: 20000 });
});
