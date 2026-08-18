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
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, stagger, fadeUp, scaleIn } from "@/components/motion";

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
    if (error) return setError(error.message);

    setEstado("guardado");
    // Con la contraseña cambiada la sesión ya es válida: entra derecho al panel.
    setTimeout(() => router.push("/panel"), 1600);
  }

  const inputCls =
    "w-full rounded-2xl bg-surface-2 border border-line px-4 py-3.5 outline-none focus:border-accent transition-colors";
  const labelCls = "block text-[12px] font-bold uppercase tracking-widest text-faint mb-2";

  return (
    <main className="min-h-screen bg-canvas text-body flex items-center justify-center p-6">
      <motion.div className="w-full max-w-sm" variants={stagger} initial="hidden" animate="show">
        <motion.div className="relative flex justify-center mb-10" variants={fadeUp}>
          <Logo size={30} />
          <ThemeToggle className="absolute right-0 top-1/2 -translate-y-1/2" />
        </motion.div>

        <motion.div className="bg-surface border border-line rounded-3xl p-7" variants={scaleIn}>
          {estado === "verificando" && (
            <p className="text-base text-faint py-6 text-center">Verificando el link…</p>
          )}

          {estado === "sin-sesion" && (
            <>
              <motion.h1 className="text-2xl font-extrabold text-ink mb-1 tracking-tight" variants={fadeUp}>
                Este link no sirve
              </motion.h1>
              <motion.p className="text-base text-muted mb-6" variants={fadeUp}>
                Puede haber vencido o ya haberse usado. Los links de recuperación
                duran un rato y son de un solo uso — pedí uno nuevo.
              </motion.p>
              <motion.div variants={fadeUp}>
                <Link href="/recuperar"
                  className="block w-full rounded-full bg-accent text-on-accent font-bold py-3.5 text-center">
                  Pedir otro link
                </Link>
              </motion.div>
            </>
          )}

          {estado === "guardado" && (
            <>
              <motion.h1 className="text-2xl font-extrabold text-ink mb-1 tracking-tight" variants={fadeUp}>
                Listo ✓
              </motion.h1>
              <motion.p className="text-base text-muted" variants={fadeUp}>
                Cambiamos tu contraseña. Te llevamos al panel…
              </motion.p>
            </>
          )}

          {estado === "listo" && (
            <>
              <motion.h1 className="text-2xl font-extrabold text-ink mb-1 tracking-tight" variants={fadeUp}>
                Nueva contraseña
              </motion.h1>
              <motion.p className="text-base text-muted mb-7" variants={fadeUp}>
                Elegí una que puedas recordar. Mínimo 6 caracteres.
              </motion.p>

              <motion.div variants={fadeUp}>
                <label className={labelCls}>Contraseña</label>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
                  placeholder="Mínimo 6 caracteres" className={`${inputCls} mb-4`} />
              </motion.div>

              <motion.div variants={fadeUp}>
                <label className={labelCls}>Repetila</label>
                <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && pass.length >= 6 && pass === pass2) guardar(); }}
                  placeholder="La misma de arriba" className={`${inputCls} mb-6`} />
              </motion.div>

              {error && (
                <motion.p className="text-base text-danger mb-4"
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                  {error}
                </motion.p>
              )}

              <motion.button
                variants={fadeUp}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={guardar}
                disabled={loading || pass.length < 6 || pass !== pass2}
                className="w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity"
              >
                {loading ? "…" : "Guardar y entrar →"}
              </motion.button>
            </>
          )}
        </motion.div>
      </motion.div>
    </main>
  );
}
