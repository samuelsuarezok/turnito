"use client";

// components/SoporteWhatsApp.tsx
// El botón para que el DUEÑO nos escriba a nosotros desde su panel.
//
// No confundir con WhatsAppFab: ese es el de la landing y le habla a un
// visitante que todavía no es cliente. Este le habla a alguien que ya está
// adentro, trabajando, y que necesita ayuda AHORA — por eso el mensaje sale
// pre-cargado con el nombre de su local: cuando el chat nos llega, ya sabemos
// quién escribe sin tener que preguntárselo.
//
// Dos variantes porque son dos lugares distintos, no el mismo botón movido:
//
//   side   — monitor. Anclado al costado derecho, siempre a la vista mientras
//            el dueño trabaja en la grilla del día.
//   bottom — celular. Al final del contenido, después de los turnos. Arriba no
//            hay lugar, y un flotante sobre una pantalla chica tapa
//            justamente lo que el dueño vino a mirar.
//
// ⚠️ La variante `side` sale por un PORTAL, y no es decoración: app/template.tsx
// envuelve cada página en un motion.div que termina con `filter: blur(0px)` en
// el style. Un filtro —aunque sea de 0px— convierte a ese div en el bloque
// contenedor de sus hijos `position: fixed`. Adentro, el botón dejaría de
// anclarse al viewport y scrollearía con la página. Colgándolo del <body> no
// pasa. Mismo motivo que WhatsAppFab y ContactModal.

import { createPortal } from "react-dom";
import { WHATSAPP_INTL } from "@/lib/contacto";
import { useMontado } from "@/lib/use-montado";

function linkSoporte(negocio?: string) {
  const texto = negocio
    ? `¡Hola! Te escribo desde el panel de Turnito. Mi local es "${negocio}" y necesito ayuda con:`
    : "¡Hola! Te escribo desde el panel de Turnito y necesito ayuda con:";
  return `https://wa.me/${WHATSAPP_INTL}?text=${encodeURIComponent(texto)}`;
}

function IconoWhatsApp({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export default function SoporteWhatsApp({
  variant,
  negocio,
}: {
  variant: "side" | "bottom";
  negocio?: string;
}) {
  // Los hooks van ANTES de cualquier return: la variante `bottom` sale por un
  // early return más abajo, y llamarlos después sería llamarlos condicionalmente.
  //
  // `montado` existe para que el portal se cree DESPUÉS de hidratar. Devolver
  // null según `typeof document` parece equivalente y no lo es: el server daría
  // null y el primer render del cliente ya daría el botón, y React lo reporta
  // como "Hydration failed". Así los dos primeros renders coinciden en null.
  const montado = useMontado();

  const href = linkSoporte(negocio);

  // ── Celular: al final del contenido, después de los turnos ──
  if (variant === "bottom") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // lg:hidden: en monitor manda la variante `side`, y dos botones de
        // soporte en la misma pantalla se leen como un error.
        className={
          "lg:hidden mt-10 flex items-center justify-center gap-2.5 w-full " +
          "rounded-full bg-[#25d366] text-white font-bold text-lg py-3.5 " +
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        }
      >
        <IconoWhatsApp size={22} />
        Soporte
      </a>
    );
  }

  // ── Monitor: anclado al costado derecho ──
  if (!montado) return null;

  return createPortal(
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "hidden lg:flex fixed right-5 top-1/2 -translate-y-1/2 z-[140] " +
        "items-center gap-2.5 rounded-full bg-[#25d366] text-white font-bold text-[15px] " +
        "px-4 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.22)] " +
        "transition-transform hover:scale-[1.04] active:scale-[0.97] " +
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      }
    >
      <IconoWhatsApp size={20} />
      Soporte
    </a>,
    document.body
  );
}
