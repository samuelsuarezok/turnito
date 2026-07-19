"use client";

// app/template.tsx
// Next.js re-monta este template en CADA navegación de ruta.
// Perfecto para animar la transición entre páginas (login → panel, etc).
// (No hace falta AnimatePresence: el template ya se re-monta solo.)

import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
