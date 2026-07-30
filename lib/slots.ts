// Fuente ÚNICA de verdad para el cálculo de horarios disponibles.
// La usan la reserva pública (app/[slug]) y el reprogramar del panel.
// Testeada en e2e-local/… — no duplicar esta lógica en otro lado.

export type OpeningRange = { weekday: number; opens_at: string; closes_at: string };
// Bloqueo de fecha: string (día completo, formato viejo) u objeto con rango.
export type ClosedEntry = string | { date: string; from_time: string | null; to_time: string | null };
export type ClosedBlock = { date: string; from_time: string | null; to_time: string | null };

// Convierte una fecha+hora "de pared" (la que ve el cliente parado en la
// barbería) al instante real, según la zona horaria del local.
//
// Hace falta porque el server corre en UTC (Vercel): ahí
// `new Date(2026, 6, 30, 16, 45)` significa 16:45 UTC = 13:45 en Córdoba, y un
// turno perfectamente válido a las 16:45 se rechazaba por "poca anticipación".
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.slice(0, 5).split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return new Date(NaN);

  // Arrancamos suponiendo que es UTC y descontamos el offset real del local.
  // Segunda pasada: en el salto de horario de verano el offset del instante
  // corregido puede no ser el mismo que el del instante supuesto.
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const ts = guess - tzOffsetMs(guess, timeZone);
  return new Date(guess - tzOffsetMs(ts, timeZone));
}

// Cuántos ms está adelantada `timeZone` respecto de UTC en ese instante.
function tzOffsetMs(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ts));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // hour puede venir "24" a medianoche según el runtime.
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return asUtc - ts;
}

export const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
export const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Normaliza el `closed` del RPC: acepta string (día completo) u objeto con rango.
export function normalizeClosed(closed: ClosedEntry[] | null | undefined): ClosedBlock[] {
  return (closed ?? []).map((c) =>
    typeof c === "string" ? { date: c, from_time: null, to_time: null } : c
  );
}

// Fechas con bloqueo de DÍA COMPLETO (from_time null) → deshabilitan el día entero.
export function fullDayClosedSet(closedBlocks: ClosedBlock[]): Set<string> {
  return new Set(closedBlocks.filter((c) => !c.from_time).map((c) => c.date));
}

export type SlotResult = { grid: string[]; availability: Record<string, boolean> };

/**
 * Calcula la grilla de horarios y su disponibilidad para un día.
 * - Horarios partidos: itera TODAS las franjas del weekday (no pisa la siesta).
 * - Bloqueos parciales (closed con from/to) se tratan como ocupados.
 * - busyIntervals: turnos ya tomados como [inicio, fin) en minutos.
 * - minStartMin: los slots antes de esto quedan no disponibles (default: sin límite).
 */
export function computeSlots(opts: {
  hours: OpeningRange[];
  weekday: number;
  date: string;
  slotMinutes: number;
  durationMin: number;
  closedBlocks: ClosedBlock[];
  busyIntervals: [number, number][];
  minStartMin?: number;
}): SlotResult {
  const { hours, weekday, date, slotMinutes, durationMin, closedBlocks, busyIntervals } = opts;
  const minStartMin = opts.minStartMin ?? -Infinity;

  const dayRanges = hours
    .filter((h) => h.weekday === weekday)
    .map((h) => [toMin(h.opens_at), toMin(h.closes_at)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (dayRanges.length === 0) return { grid: [], availability: {} };

  const blocked = closedBlocks
    .filter((c) => c.date === date && c.from_time && c.to_time)
    .map((c) => [toMin(c.from_time as string), toMin(c.to_time as string)] as [number, number]);
  const taken = [...busyIntervals, ...blocked];

  const grid: string[] = [];
  const availability: Record<string, boolean> = {};
  for (const [open, close] of dayRanges) {
    for (let t = open; t + slotMinutes <= close; t += slotMinutes) {
      const label = toHHMM(t);
      grid.push(label);
      const fits = t >= minStartMin && t + durationMin <= close;
      const overlaps = taken.some(([bs, be]) => t < be && t + durationMin > bs);
      availability[label] = fits && !overlaps;
    }
  }
  return { grid, availability };
}
