import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Skills de agentes (hyperframes y compañía). Es código de terceros que se
    // instala con `npx skills add` y trae su propio estilo: GSAP minificado,
    // scripts .cjs con `require`, tests sueltos. Lintearlo metía 87 errores
    // ajenos y dejaba el CI en rojo sin que hubiera UN solo problema en la app.
    ".agents/**",
    ".claude/skills/**",
  ]),
]);

export default eslintConfig;
