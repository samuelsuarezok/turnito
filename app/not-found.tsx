"use client";

// 404 PROPIA — aparece en cualquier ruta que no exista.

import Link from "next/link";
import Logo from "@/components/Logo";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#F0F1F3] flex items-center justify-center p-6">
      <motion.div className="text-center max-w-sm"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex justify-center mb-8">
          <Logo variant="light" size={28} />
        </div>

        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
          className="text-7xl font-extrabold text-[#014CFF] mb-4 tracking-tighter">
          404
        </motion.div>

        <h1 className="text-xl font-extrabold text-black mb-2">Esta página no existe</h1>
        <p className="text-sm text-[#5E6470] mb-8">
          Puede que el link esté mal escrito o que el negocio que buscás ya no esté disponible.
        </p>

        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="inline-block">
          <Link href="/"
            className="inline-block rounded-full bg-[#014CFF] text-white font-bold text-sm px-8 py-3.5">
            Ir al inicio →
          </Link>
        </motion.div>
      </motion.div>
    </main>
  );
}
