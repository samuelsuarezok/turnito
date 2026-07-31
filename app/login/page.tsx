"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, stagger, fadeUp, scaleIn } from "@/components/motion";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");
    setLoading(true);
    const { error } =
      mode === "register"
        ? await supabase.auth.signUp({ email, password: pass })
        : await supabase.auth.signInWithPassword({ email, password: pass });
    setLoading(false);
    if (error) return setError(error.message);
    router.push(mode === "register" ? "/onboarding" : "/panel");
  }

  const inputCls =
    "w-full rounded-2xl bg-surface-2 border border-line px-4 py-3.5 outline-none focus:border-accent transition-colors";
  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-faint mb-2";

  return (
    <main className="min-h-screen bg-canvas text-body flex items-center justify-center p-6">
      <motion.div className="w-full max-w-sm" variants={stagger} initial="hidden" animate="show">
        {/* El logo queda centrado y el toggle se apoya en el borde derecho de
            la columna: si fueran hermanos en un flex, el logo se correría. */}
        <motion.div className="relative flex justify-center mb-10" variants={fadeUp}>
          <Logo size={30} />
          <ThemeToggle className="absolute right-0 top-1/2 -translate-y-1/2" />
        </motion.div>

        <motion.div className="bg-surface border border-line rounded-3xl p-7" variants={scaleIn}>
          <motion.h1 className="text-2xl font-extrabold text-ink mb-1 tracking-tight" variants={fadeUp}>
            {mode === "register" ? "Creá tu cuenta" : "Ingresá a tu panel"}
          </motion.h1>
          <motion.p className="text-sm text-muted mb-7" variants={fadeUp}>
            {mode === "register" ? (
              <><span className="text-accent-ink font-bold">30 días gratis</span> · sin tarjeta</>
            ) : ("Bienvenido de nuevo")}
          </motion.p>

          <motion.div variants={fadeUp}>
            <label className={labelCls}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tunombre@gmail.com"
              className={`${inputCls} mb-4`} />
          </motion.div>

          <motion.div variants={fadeUp}>
            <label className={labelCls}>Contraseña</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo 6 caracteres"
              className={`${inputCls} mb-6`} />
          </motion.div>

          {error && (
            <motion.p className="text-sm text-danger mb-4" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              {error}
            </motion.p>
          )}

          <motion.button
            variants={fadeUp}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={loading || !email.includes("@") || pass.length < 6}
            className="w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity"
          >
            {loading ? "…" : mode === "register" ? "Crear cuenta →" : "Ingresar →"}
          </motion.button>

          {/* ¿Olvidaste tu contraseña? — solo en modo login */}
          {mode === "login" && (
            <motion.p className="text-center mt-4" variants={fadeUp}>
              <Link href="/recuperar" className="text-xs text-faint underline hover:text-accent-ink transition-colors">
                ¿Olvidaste tu contraseña?
              </Link>
            </motion.p>
          )}
        </motion.div>

        <motion.p className="text-sm text-muted mt-6 text-center" variants={fadeUp}>
          {mode === "register" ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?"}{" "}
          <button onClick={() => setMode(mode === "register" ? "login" : "register")} className="text-accent-ink font-bold">
            {mode === "register" ? "Ingresá" : "Registrate gratis"}
          </button>
        </motion.p>

        {/* Fuera del botón de arriba: antes estaba anidado adentro y tocar
            "Términos" alternaba el modo en vez de abrir el link. */}
        {mode === "register" && (
          <motion.p className="text-[10px] text-faint text-center mt-4 leading-relaxed" variants={fadeUp}>
            Al crear tu cuenta aceptás los{" "}
            <Link href="/legales" className="underline hover:text-accent-ink transition-colors">
              Términos y la Política de Privacidad
            </Link>
          </motion.p>
        )}
      </motion.div>
    </main>
  );
}
