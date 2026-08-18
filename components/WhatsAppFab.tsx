"use client";

// components/WhatsAppFab.tsx
// Botón flotante de WhatsApp de la landing.
//
// Sale por un PORTAL a propósito, igual que ContactModal, y por un motivo
// concreto: app/template.tsx envuelve TODAS las páginas en un motion.div que
// anima `filter` y termina con `filter: blur(0px)` puesto en el style. Un
// filtro —aunque sea de 0px— convierte a ese div en el bloque contenedor de
// sus hijos `position: fixed`. Adentro, el botón dejaría de anclarse al
// viewport y scrollearía con la página. Colgándolo del <body> eso no pasa.
//
// El número no se escribe acá: sale de lib/contacto.ts, que es el único lugar
// donde vive el contacto público de Turnito.

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { WHATSAPP_URL } from "@/lib/contacto";

export default function WhatsAppFab() {
  // En el render del server no hay document. Un portal no aporta nada al árbol
  // en su lugar de origen, así que devolver null acá y crearlo en el cliente no
  // le deja a la hidratación ninguna diferencia que reclamar. Mismo criterio que
  // ContactModal.
  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp"
      // Entra con un respiro para no pelearle la atención al hero.
      // Las animaciones de transform las apaga solo el MotionConfig
      // reducedMotion="user" del template: los portales conservan el contexto.
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.9, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={
        "group fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[150] " +
        "flex items-center rounded-full p-4 text-white " +
        "bg-[#25d366] shadow-[0_8px_28px_rgba(0,0,0,0.22)] " +
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      }
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
      </svg>

      {/* La etiqueta se despliega sólo donde hay hover DE VERDAD: en Tailwind v4
          la variante `hover:` ya vive dentro de @media (hover:hover), así que en
          un celular no queda abierta por el tap justo antes de irse a WhatsApp. */}
      <span
        className={
          "max-w-0 overflow-hidden whitespace-nowrap text-[14.5px] font-semibold " +
          "transition-[max-width,margin] duration-300 ease-[cubic-bezier(.22,1,.36,1)] " +
          "group-hover:ml-2.5 group-hover:max-w-[170px] motion-reduce:transition-none"
        }
      >
        Escribinos
      </span>
    </motion.a>,
    document.body
  );
}
