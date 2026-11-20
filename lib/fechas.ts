// Fechas para mostrar. La app guarda "YYYY-MM-DD" y en varias pantallas ese
// formato crudo terminaba en la cara del usuario ("2026-11-21"). Esto lo pasa a
// algo que se lee: "hoy", "mañana", "el sábado 21", "sáb 21 nov".
//
// Todo se arma con la fecha LOCAL del navegador (new Date(y, m-1, d)), nunca con
// new Date("YYYY-MM-DD"), que se interpreta como UTC y en Argentina corre el
// día para atrás.

export const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function partes(ds: string) {
  const [y, m, d] = ds.split("-").map(Number);
  return { d, m, dow: new Date(y, m - 1, d).getDay() };
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "hoy", "mañana" o "el sábado 21". */
export function diaRelativo(ds: string) {
  const hoy = fmtDate(new Date());
  const manana = fmtDate(new Date(Date.now() + 86400000));
  if (ds === hoy) return "hoy";
  if (ds === manana) return "mañana";
  const { d, dow } = partes(ds);
  return `el ${DIAS_LARGOS[dow]} ${d}`;
}

/** "viernes 20 de noviembre". */
export function fechaLarga(ds: string) {
  const { d, m, dow } = partes(ds);
  return `${DIAS_LARGOS[dow]} ${d} de ${MESES[m - 1]}`;
}

/** "sáb 21 nov". Para listas y chips donde no entra la larga. */
export function fechaCorta(ds: string) {
  const { d, m, dow } = partes(ds);
  return `${DIAS_CORTOS[dow]} ${d} ${MESES_CORTOS[m - 1]}`;
}

/** "21 nov". Para los ejes de los gráficos. */
export function diaMes(ds: string) {
  const { d, m } = partes(ds);
  return `${d} ${MESES_CORTOS[m - 1]}`;
}
