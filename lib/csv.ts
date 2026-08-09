// Exportar turnos a un archivo que Excel abra bien.
//
// Es CSV y no .xlsx a propósito: Excel lo abre con doble clic igual, y un xlsx
// de verdad obliga a sumar una librería de cientos de kB al bundle para algo
// que se usa una vez por mes.
//
// Dos detalles sin los cuales Excel en español lo arruina:
//   - Separador ";". Con coma, la configuración regional de Argentina mete
//     toda la fila en una sola columna.
//   - BOM al principio. Sin él, "Martín" se lee "MartÃ­n".

/** Etiquetas de estado, para que el archivo no salga en inglés. */
export const ESTADO_LABEL: Record<string, string> = {
  confirmed: "Confirmado",
  done: "Atendido",
  no_show: "No vino",
  cancelled_by_client: "Cancelado por el cliente",
  cancelled_by_shop: "Cancelado por el local",
};

/** Las comillas dobles de adentro se escapan duplicándolas: estándar CSV. */
const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export type FilaTurno = {
  date: string;
  time: string;
  status: string;
  client_name: string;
  client_phone: string;
  service_name: string | null;
  price: number | null;
  staff_id: string | null;
};

/**
 * Arma el CSV. `nombreStaff` resuelve el id de la persona a su nombre; se pasa
 * de afuera porque quien llama ya tiene el equipo cargado.
 */
export function turnosACsv(filas: FilaTurno[], nombreStaff: (id: string | null) => string | null) {
  const cuerpo = filas.map((a) => [
    a.date,
    String(a.time).slice(0, 5),
    ESTADO_LABEL[a.status] ?? a.status,
    a.client_name,
    a.client_phone,
    a.service_name ?? "",
    nombreStaff(a.staff_id) ?? "",
    a.price ?? "",
  ]);

  const encabezado = ["Fecha", "Hora", "Estado", "Cliente", "Teléfono", "Servicio", "Atiende", "Precio"];

  return "﻿" + [encabezado, ...cuerpo].map((f) => f.map(celda).join(";")).join("\r\n");
}

/** Dispara la descarga en el navegador. */
export function descargarCsv(contenido: string, nombreArchivo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
