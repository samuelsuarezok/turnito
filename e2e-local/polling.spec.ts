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

test.afterAll(async () => { if (apptId) await admin.from("appointments").delete().eq("id", apptId); });

test("polling: turno nuevo aparece solo (sin recargar) en la misma pantalla", async ({ context, page }) => {
  test.setTimeout(45000);
  await context.addCookies(cookies);
  await page.goto("/panel");
  await page.waitForTimeout(2000);
  await expect(page.getByText("POLLING-TEST")).toHaveCount(0); // todavía no existe

  // Insertar turno para HOY (simula reserva de un cliente mientras el panel está abierto)
  const shop = await getNegocio(admin);
  const { data: svc } = await admin.from("services").select("id").eq("business_id", shop.id).eq("active", true).limit(1).single();
  const { data } = await admin.from("appointments")
    .insert({ business_id: shop.id, service_id: svc!.id, date: TODAY, time: "20:00", client_name: "POLLING-TEST", client_phone: "000" })
    .select("id").single();
  apptId = data!.id;

  // NO recargamos: el polling (15s) debe traerlo solo
  await expect(page.getByText("POLLING-TEST")).toBeVisible({ timeout: 20000 });
});
