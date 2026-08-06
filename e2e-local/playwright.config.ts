import { defineConfig } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Cargar .env para specs que necesitan Supabase (crear/limpiar datos de prueba)
try {
  for (const line of readFileSync(path.resolve(__dirname, "../.env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* noop */ }

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  outputDir: "./test-results",
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  reporter: [["list"]],
});
