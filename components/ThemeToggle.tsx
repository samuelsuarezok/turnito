"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export const THEME_KEY = "turnito-theme";

/**
 * Se corre ANTES de pintar (va inline en el <head>, ver app/layout.tsx).
 * Sin esto la página arranca siempre en claro y pega un flash blanco antes
 * de saltar a oscuro, que es lo peor que le podés hacer a alguien que eligió
 * modo noche.
 */
export const themeInitScript = `(function(){try{
var t=localStorage.getItem('${THEME_KEY}');
if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.setAttribute('data-theme',t)
}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`;

function apply(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // Modo incógnito con storage bloqueado: el tema igual se aplica,
    // sólo que no sobrevive a la recarga. No es motivo para romper nada.
  }
}

// El tema real vive en el atributo data-theme del <html>, que lo escribe el
// script del layout antes de pintar. En vez de duplicarlo en un useState y
// sincronizarlo con un efecto, lo LEEMOS de ahí con useSyncExternalStore:
// una sola fuente de verdad, y si algún día otra pantalla lo cambia, este
// botón se entera solo.
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const getSnapshot = (): Theme =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
// En el server no hay DOM ni localStorage: asumimos día y el cliente corrige
// solo apenas hidrata.
const getServerSnapshot = (): Theme => "light";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    apply(theme === "dark" ? "light" : "dark");
  }

  const base =
    "inline-flex items-center justify-center w-9 h-9 rounded-full border border-line " +
    "bg-surface text-muted hover:text-accent-ink transition-colors shrink-0";

  const esNoche = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`${base} ${className}`}
      aria-label={esNoche ? "Cambiar a modo día" : "Cambiar a modo noche"}
      title={esNoche ? "Modo día" : "Modo noche"}
    >
      {esNoche ? (
        // Sol — lo que vas a obtener si tocás
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6l1.6-1.6M18 6l1.6-1.6" />
        </svg>
      ) : (
        // Luna
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.4A8.5 8.5 0 1 1 9.6 3.5a6.8 6.8 0 0 0 10.9 10.9Z" />
        </svg>
      )}
    </button>
  );
}
