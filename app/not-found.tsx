"use client";

// 404 PROPIA — aparece en cualquier ruta que no exista.

import Link from "next/link";
import Logo from "@/components/Logo";
import { motion } from "framer-motion";
import * as ui from "@/lib/ui";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <motion.div className="text-center max-w-sm"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <div className="flex justify-center mb-10">
          <Logo size={28} />
        </div>

        <p className="font-mono text-[14px] text-muted mb-3">Error 404</p>
        <h1 className={`${ui.h1} mb-3`}>Esta página no existe</h1>
        <p className="text-[16px] leading-6 text-muted mb-8">
          Puede que el link esté mal escrito o que el negocio que buscás ya no esté disponible.
        </p>

        <Link href="/" className={ui.btnPrimary}>
          Ir al inicio
        </Link>
      </motion.div>
    </main>
  );
}
