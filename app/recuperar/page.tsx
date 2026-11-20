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
import { motion, EASE } from "@/components/motion";
import * as ui from "@/lib/ui";

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
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
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

  return (
    <main className="min-h-screen bg-canvas text-body flex items-center justify-center p-6">
      <motion.div className="w-full max-w-sm"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        <div className="relative flex justify-center mb-8">
          <Logo size={28} />
          <ThemeToggle className="absolute right-0 top-1/2 -translate-y-1/2" />
        </div>

        <div className={`${ui.card} p-8`}>
          {enviado ? (
            <>
              <h1 className={ui.h1}>Revisá tu mail</h1>
              <p className="text-[16px] leading-6 text-muted mt-2">
                Si <span className="text-ink font-medium">{email.trim()}</span> tiene una cuenta, te
                mandamos un link para poner una contraseña nueva.
              </p>
              <p className="text-[14px] leading-5 text-muted mt-2 mb-8">
                Puede tardar un minuto. Fijate también en spam.
              </p>
              <Link href="/login" className={`${ui.btnPrimary} w-full`}>
                Volver a ingresar
              </Link>
            </>
          ) : (
            // Un <form> de verdad: Enter envía y el navegador ofrece el mail guardado.
            <form noValidate onSubmit={(e) => { e.preventDefault(); if (!loading && email.includes("@")) enviar(); }}>
              <h1 className={ui.h1}>Recuperar contraseña</h1>
              <p className="text-[16px] leading-6 text-muted mt-2 mb-8">
                Poné tu mail y te mandamos un link para crear una nueva.
              </p>

              <label className={ui.label} htmlFor="r-email">Email</label>
              <input id="r-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" autoCapitalize="none" spellCheck={false}
                placeholder="tunombre@gmail.com" className={`${ui.input({ bg: "bg-surface-2" })} mb-6`} />

              {error && (
                <motion.p role="alert" className={`${ui.errorBox} mb-4`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {error}
                </motion.p>
              )}

              <button type="submit" disabled={loading || !email.includes("@")} aria-busy={loading}
                className={`${ui.btnPrimary} w-full`}>
                {loading ? "Enviando…" : "Mandame el link"}
              </button>
            </form>
          )}
        </div>

        <p className="text-[15px] leading-6 text-muted mt-6 text-center">
          ¿Te acordaste?{" "}
          <Link href="/login" className="font-semibold text-accent-ink hover:underline underline-offset-2">Ingresá</Link>
        </p>
      </motion.div>
    </main>
  );
}
