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

  // SERIAL, y no es por lentitud: todos los specs le pegan a la MISMA base real.
  //
  // `fullyParallel: false` solo serializa dentro de un archivo — los archivos
  // distintos igual corren en paralelo, en workers separados. Eso rompía: tres
  // specs buscaban "el primer día libre" al mismo tiempo, elegían el mismo, y
  // chocaban contra el índice único appointments_slot_unique.
  //
  // Se podría dar a cada spec horarios distintos, pero es un parche: el próximo
  // spec que alguien escriba vuelve a chocar. Con estado compartido y mutable,
  // la única respuesta correcta es no correrlos en paralelo.
  //
  // Cuesta unos segundos más. Con una base de test por worker se podría volver
  // a paralelizar, pero hoy no la hay.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  reporter: [["list"]],
});
