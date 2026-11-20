"use client";

// Paso 2 de recuperar contraseña: poner la nueva.
//
// Acá se aterriza desde el link del mail. Supabase deja una sesión de
// RECUPERACIÓN establecida (el token viaja en el hash de la URL y lo consume el
// cliente solo), así que updateUser() puede cambiar la contraseña sin pedir la
// vieja — que es justamente la que el usuario no se acuerda.
//
// Por eso hay que verificar que esa sesión exista: si alguien entra a esta URL
// de prendido, sin venir del mail, no tiene que poder cambiar nada.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { traducirErrorAuth } from "@/lib/auth-errors";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, EASE } from "@/components/motion";
import * as ui from "@/lib/ui";

type Estado = "verificando" | "listo" | "sin-sesion" | "guardado";

export default function NuevaPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [estado, setEstado] = useState<Estado>("verificando");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // El SDK procesa el hash de la URL de forma asíncrona, así que preguntar por
    // la sesión al toque puede dar null aunque el link sea válido. Escuchamos el
    // evento PASSWORD_RECOVERY y además chequeamos por las dudas.
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "PASSWORD_RECOVERY" || sesion) setEstado("listo");
    });

    supabase.auth.getSession().then(({ data }) => {
      setEstado((prev) => (prev === "listo" ? prev : data.session ? "listo" : "sin-sesion"));
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar() {
    setError("");
    if (pass !== pass2) return setError("Las dos contraseñas no coinciden.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setLoading(false);
    if (error) return setError(traducirErrorAuth(error));

    setEstado("guardado");
    // Con la contraseña cambiada la sesión ya es válida: entra derecho al panel.
    setTimeout(() => router.push("/panel"), 1600);
  }

  const subtitulo = "text-[16px] leading-6 text-muted mt-2";

  return (
    <main className="min-h-screen bg-canvas text-body flex items-center justify-center p-6">
      <motion.div className="w-full max-w-sm"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        <div className="relative flex justify-center mb-8">
          <Logo size={28} />
          <ThemeToggle className="absolute right-0 top-1/2 -translate-y-1/2" />
        </div>

        <div className={`${ui.card} p-8`}>
          {estado === "verificando" && (
            <p className="text-[15px] text-muted py-6 text-center">Verificando el link…</p>
          )}

          {estado === "sin-sesion" && (
            <>
              <h1 className={ui.h1}>Este link no sirve</h1>
              <p className={`${subtitulo} mb-8`}>
                Puede haber vencido o ya haberse usado. Los links de recuperación
                duran un rato y son de un solo uso: pedí uno nuevo.
              </p>
              <Link href="/recuperar" className={`${ui.btnPrimary} w-full`}>
                Pedir otro link
              </Link>
            </>
          )}

          {estado === "guardado" && (
            <>
              <h1 className={ui.h1}>Listo</h1>
              <p className={subtitulo}>
                Cambiamos tu contraseña. Te llevamos al panel…
              </p>
            </>
          )}

          {estado === "listo" && (
            // Un <form> de verdad: Enter guarda y el gestor de contraseñas
            // ofrece guardar la nueva (autocomplete="new-password").
            <form noValidate onSubmit={(e) => { e.preventDefault(); if (!loading && pass.length >= 6 && pass === pass2) guardar(); }}>
              <h1 className={ui.h1}>Nueva contraseña</h1>
              <p className={`${subtitulo} mb-8`}>
                Elegí una que puedas recordar. Mínimo 6 caracteres.
              </p>

              <label className={ui.label} htmlFor="n-pass">Contraseña</label>
              <input id="n-pass" type="password" value={pass} onChange={(e) => setPass(e.target.value)}
                autoComplete="new-password" placeholder="Mínimo 6 caracteres"
                className={`${ui.input({ bg: "bg-surface-2" })} mb-5`} />

              <label className={ui.label} htmlFor="n-pass2">Repetila</label>
              <input id="n-pass2" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)}
                autoComplete="new-password" placeholder="La misma de arriba"
                className={`${ui.input({ bg: "bg-surface-2" })} mb-6`} />

              {error && (
                <motion.p role="alert" className={`${ui.errorBox} mb-4`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {error}
                </motion.p>
              )}

              <button type="submit" disabled={loading || pass.length < 6 || pass !== pass2} aria-busy={loading}
                className={`${ui.btnPrimary} w-full`}>
                {loading ? "Guardando…" : "Guardar y entrar"}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </main>
  );
}
