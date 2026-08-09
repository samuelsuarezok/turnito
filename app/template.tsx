"use client";

// app/template.tsx
// Next.js re-monta este template en CADA navegación de ruta.
// Perfecto para animar la transición entre páginas (login → panel, etc).
// (No hace falta AnimatePresence: el template ya se re-monta solo.)

import { MotionConfig, motion, useReducedMotion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Template({ children }: { children: React.ReactNode }) {
  const sinMovimiento = useReducedMotion();

  return (
    // reducedMotion="user" hace que TODA la app respete la preferencia del
    // sistema operativo: framer desactiva las animaciones de transform (los
    // reveals al scrollear, los modales que suben, los staggers, los springs) y
    // deja las de opacidad y color, que ayudan a entender qué cambió sin
    // producir movimiento.
    //
    // Va acá y no en layout.tsx porque el layout es un componente de servidor.
    // El template envuelve todas las páginas y ya es de cliente. El modal de
    // contacto sale por un portal, pero los portales conservan el contexto de
    // React, así que también queda cubierto.
    <MotionConfig reducedMotion="user">
      <motion.div
        // El desenfoque no lo cubre `reducedMotion` (no es un transform), así
        // que lo sacamos a mano: es una animación de entrada más.
        initial={{ opacity: 0, y: 14, filter: sinMovimiento ? "none" : "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: sinMovimiento ? "none" : "blur(0px)" }}
        transition={{ duration: sinMovimiento ? 0.2 : 0.45, ease: EASE }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
