"use client";

// Paso 1 de recuperar contraseña: pedir el mail.
//
// Esta ruta ya estaba enlazada desde /login ("¿Olvidaste tu contraseña?") pero
// no existía, así que la agarraba /[slug] y el usuario terminaba en una página
// de reserva de un negocio llamado "recuperar". El link llevaba a la nada.

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, stagger, fadeUp, scaleIn } from "@/components/motion";

export default function RecuperarPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    setError("");
    setLoading(true);

    // El destino se arma con el origin del browser y NO con una constante: así
    // funciona igual en local, en los previews de Vercel y en producción.
    //
    // OJO: Supabase solo respeta este redirectTo si la URL está en la lista de
    // "Redirect URLs" del proyecto. Si no está, lo ignora en silencio y usa el
    // Site URL. Ver el README.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/recuperar/nueva`,
    });
    setLoading(false);

    // Se muestra el mismo mensaje haya o no una cuenta con ese mail.
    //
    // Si dijéramos "ese email no está registrado", cualquiera podría averiguar
    // qué direcciones tienen cuenta probándolas de a una. Es el mismo criterio
    // que usa la mayoría de los servicios serios.
    if (error && !/rate limit/i.test(error.message)) {
      console.error("[recuperar]", error.message);
    }
    if (error && /rate limit/i.test(error.message)) {
      setError("Probaste varias veces seguidas. Esperá unos minutos.");
      return;
    }
    setEnviado(true);
  }

  const inputCls =
    "w-full rounded-2xl bg-surface-2 border border-line px-4 py-3.5 outline-none focus:border-accent transition-colors";
  const labelCls = "block text-[13px] font-bold uppercase tracking-widest text-faint mb-2";

  return (
    <main className="min-h-screen bg-canvas text-body flex items-center justify-center p-6">
      <motion.div className="w-full max-w-sm" variants={stagger} initial="hidden" animate="show">
        <motion.div className="relative flex justify-center mb-10" variants={fadeUp}>
          <Logo size={30} />
          <ThemeToggle className="absolute right-0 top-1/2 -translate-y-1/2" />
        </motion.div>

        <motion.div className="bg-surface border border-line rounded-3xl p-7" variants={scaleIn}>
          {enviado ? (
            <>
              <motion.h1 className="text-[26px] font-extrabold text-ink mb-1 tracking-tight" variants={fadeUp}>
                Revisá tu mail
              </motion.h1>
              <motion.p className="text-lg text-muted mb-2" variants={fadeUp}>
                Si <span className="text-ink font-bold">{email.trim()}</span> tiene una cuenta, te
                mandamos un link para poner una contraseña nueva.
              </motion.p>
              <motion.p className="text-[15px] text-faint mb-6" variants={fadeUp}>
                Puede tardar un minuto. Fijate también en spam.
              </motion.p>
              <motion.div variants={fadeUp}>
                <Link href="/login"
                  className="block w-full rounded-full bg-accent text-on-accent font-bold py-3.5 text-center">
                  Volver a ingresar
                </Link>
              </motion.div>
            </>
          ) : (
            <>
              <motion.h1 className="text-[26px] font-extrabold text-ink mb-1 tracking-tight" variants={fadeUp}>
                Recuperar contraseña
              </motion.h1>
              <motion.p className="text-lg text-muted mb-7" variants={fadeUp}>
                Poné tu mail y te mandamos un link para crear una nueva.
              </motion.p>

              <motion.div variants={fadeUp}>
                <label className={labelCls}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && email.includes("@")) enviar(); }}
                  placeholder="tunombre@gmail.com" className={`${inputCls} mb-6`} />
              </motion.div>

              {error && (
                <motion.p className="text-lg text-danger mb-4"
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                  {error}
                </motion.p>
              )}

              <motion.button
                variants={fadeUp}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={enviar}
                disabled={loading || !email.includes("@")}
                className="w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity"
              >
                {loading ? "…" : "Mandame el link →"}
              </motion.button>
            </>
          )}
        </motion.div>

        <motion.p className="text-lg text-muted mt-6 text-center" variants={fadeUp}>
          ¿Te acordaste?{" "}
          <Link href="/login" className="text-accent-ink font-bold">Ingresá</Link>
        </motion.p>
      </motion.div>
    </main>
  );
}
