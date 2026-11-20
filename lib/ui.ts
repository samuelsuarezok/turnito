// Clases compartidas de la interfaz. Un solo alto, un solo radio y una sola
// transición por tipo de control, así las pantallas no se van desparejando una
// por una (que es exactamente lo que había pasado: cada página tenía su propio
// botón, su propio input y su propio rótulo en mayúsculas).
//
// Vive en lib/ y no en components/ a propósito: son strings, no componentes, y
// /admin es un componente de SERVIDOR. Si esto estuviera en un archivo
// "use client", el server recibiría referencias en vez de strings.
//
// Reglas que salen de acá:
// · Botones de 48px (h-12), redondos. Los chicos, 40px.
// · Inputs de 48px, radio 12, texto de 16px (con menos, iOS hace zoom al
//   enfocar). Al enfocar, borde de acento y un anillo suave.
// · Rótulos en tipo oración, nunca en mayúsculas espaciadas.
// · Selección = borde de acento + fondo accent-soft. El acento lleno queda
//   para la acción principal y el horario elegido.
// · Pesos 400/500/600. Nada de 700-900.

const ease = "duration-150";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-accent text-on-accent text-[16px] font-semibold " +
  `transition-[background-color,opacity,transform] ${ease} hover:bg-[var(--c-accent-hover)] active:scale-[0.98] ` +
  // Apagado en neutro y no en acento transparente: el lima al 40% sobre negro
  // quedaba color oliva y no se leía como "todavía no".
  "disabled:bg-line disabled:text-muted disabled:hover:bg-line disabled:active:scale-100 disabled:cursor-not-allowed " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full border border-line bg-surface text-ink text-[16px] font-semibold " +
  `transition-[background-color,transform] ${ease} hover:bg-surface-2 active:scale-[0.98] disabled:opacity-40 ` +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Botón chico (40px): guardar de una tarjeta, marcar una ausencia. */
export const btnSm = "h-10! px-5! text-[14px]!";

/** Acción de texto, sin caja: "Mejor no", "Volver". */
export const btnTexto =
  "inline-flex items-center justify-center gap-1.5 h-11 text-[15px] text-muted transition-colors hover:text-ink";

/** Agregar algo a una lista: borde punteado, acento en el texto. */
export const btnAgregar =
  "w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl border border-dashed border-line text-[15px] font-semibold text-accent-ink " +
  `transition-[background-color,border-color] ${ease} hover:border-accent hover:bg-accent-soft`;

export const iconBtn =
  "inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted transition-colors hover:text-ink hover:bg-surface-2 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

export const navLink =
  "inline-flex items-center gap-2 h-9 px-2.5 rounded-lg text-[14px] font-medium text-muted transition-colors hover:text-ink hover:bg-surface";

/** Rótulo de un campo de formulario. */
export const label = "block text-[14px] leading-5 font-medium text-body mb-2";
/** Rótulo de un grupo (Servicio, Día, Horario…). */
export const sectionLabel = "block text-[14px] leading-5 font-medium text-muted mb-3";
/** Texto de ayuda debajo de un campo. */
export const ayuda = "text-[13px] leading-5 text-muted";

export function input({ bad = false, bg = "bg-surface" }: { bad?: boolean; bg?: string } = {}) {
  return (
    `w-full h-12 rounded-xl ${bg} border px-4 text-[16px] text-ink placeholder:text-faint outline-none ` +
    `transition-[border-color,box-shadow] ${ease} disabled:text-muted ` +
    (bad
      ? "border-danger focus:shadow-[0_0_0_3px_var(--c-danger-soft)]"
      : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--c-accent-soft)]")
  );
}

export const select =
  "h-10 rounded-lg bg-surface border border-line px-3 text-[15px] text-ink outline-none transition-colors focus:border-accent";

export const fieldError = "text-[14px] leading-5 text-danger mt-2";
export const errorBox = "rounded-xl bg-danger-soft text-danger text-[14px] leading-5 px-4 py-3";

export const card = "rounded-3xl bg-surface border border-line";

export const h1 = "text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-ink";
export const h2 = "text-[18px] leading-6 font-semibold text-ink";

export const chip = (on: boolean) =>
  "shrink-0 inline-flex items-center h-9 px-4 rounded-full border text-[14px] font-medium transition-colors " +
  (on ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-muted hover:text-ink");

/** Una opción para elegir dentro de una grilla (servicio, persona). */
export const opcion = (on: boolean) =>
  "rounded-xl border p-3 text-center transition-colors " +
  (on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-faint");

/** Un horario de la grilla: libre, elegido u ocupado. */
export const horario = (libre: boolean, on: boolean) =>
  "h-10 rounded-lg border text-[14px] font-medium tabular-nums transition-colors " +
  (!libre ? "border-transparent bg-canvas text-faint line-through cursor-not-allowed"
    : on ? "border-accent bg-accent text-on-accent"
    : "border-line bg-surface text-ink hover:border-faint");
