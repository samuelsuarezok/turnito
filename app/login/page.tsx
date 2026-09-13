"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, stagger, fadeUp, scaleIn } from "@/components/motion";

type Errors = { email?: string; pass?: string; form?: string };

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  /* El botón nunca se deshabilita por campos vacíos: un botón apagado no
     explica qué falta. Validamos al enviar y respondemos campo por campo. */
  function validate(): Errors {
    const next: Errors = {};
    const mail = email.trim();
    if (!mail) next.email = "Ingresá tu email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) next.email = "Ese email no parece válido";

    if (!pass) next.pass = "Ingresá tu contraseña";
    // El mínimo de 6 es un requisito de registro. Exigirlo al ingresar dejaría
    // afuera a cuentas viejas con contraseñas más cortas.
    else if (mode === "register" && pass.length < 6)
      next.pass = "La contraseña necesita al menos 6 caracteres";

    return next;
  }

  async function handleSubmit() {
    const next = validate();
    setErrors(next);
    if (next.email || next.pass) return;

    setLoading(true);
    const { error } =
      mode === "register"
        ? await supabase.auth.signUp({ email: email.trim(), password: pass })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setLoading(false);
    if (error) return setErrors({ form: error.message });
    router.push(mode === "register" ? "/onboarding" : "/panel");
  }

  function switchMode() {
    setMode(mode === "register" ? "login" : "register");
    setErrors({});
  }

  const inputCls =
    "w-full rounded-2xl bg-surface-2 border px-4 py-3.5 outline-none transition-colors";
  const okCls = "border-line focus:border-accent";
  const badCls = "border-danger focus:border-danger";
  const labelCls = "block text-[13px] font-bold uppercase tracking-widest text-faint mb-2";
  const fieldErrCls = "text-[13px] text-danger mt-1.5";

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
          <motion.h1 className="text-[26px] font-extrabold text-ink mb-1 tracking-tight" variants={fadeUp}>
            {mode === "register" ? "Creá tu cuenta" : "Ingresá a tu panel"}
          </motion.h1>
          <motion.p className="text-lg text-muted mb-7" variants={fadeUp}>
            {mode === "register" ? (
              <><span className="text-accent-ink font-bold">30 días gratis</span> · sin tarjeta</>
            ) : ("Bienvenido de nuevo")}
          </motion.p>

          <motion.div className="mb-4" variants={fadeUp}>
            <label className={labelCls} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors({ ...errors, email: undefined });
              }}
              placeholder="tunombre@gmail.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={`${inputCls} ${errors.email ? badCls : okCls}`}
            />
            {errors.email && <p id="email-error" className={fieldErrCls}>{errors.email}</p>}
          </motion.div>

          <motion.div className="mb-6" variants={fadeUp}>
            <label className={labelCls} htmlFor="pass">Contraseña</label>
            <input
              id="pass"
              type="password"
              value={pass}
              onChange={(e) => {
                setPass(e.target.value);
                if (errors.pass) setErrors({ ...errors, pass: undefined });
              }}
              placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Tu contraseña"}
              aria-invalid={!!errors.pass}
              aria-describedby={errors.pass ? "pass-error" : undefined}
              className={`${inputCls} ${errors.pass ? badCls : okCls}`}
            />
            {errors.pass && <p id="pass-error" className={fieldErrCls}>{errors.pass}</p>}
          </motion.div>

          {errors.form && (
            <motion.p role="alert" className="text-lg text-danger mb-4" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              {errors.form}
            </motion.p>
          )}

          <motion.button
            variants={fadeUp}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity"
          >
            {loading ? "…" : mode === "register" ? "Crear cuenta →" : "Ingresar →"}
          </motion.button>

          {/* ¿Olvidaste tu contraseña? — solo en modo login */}
          {mode === "login" && (
            <motion.p className="text-center mt-4" variants={fadeUp}>
              <Link href="/recuperar" className="text-[15px] text-faint underline hover:text-accent-ink transition-colors">
                ¿Olvidaste tu contraseña?
              </Link>
            </motion.p>
          )}
        </motion.div>

        <motion.p className="text-lg text-muted mt-6 text-center" variants={fadeUp}>
          {mode === "register" ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?"}{" "}
          <button onClick={switchMode} className="text-accent-ink font-bold">
            {mode === "register" ? "Ingresá" : "Registrate gratis"}
          </button>
        </motion.p>

        {/* Fuera del botón de arriba: antes estaba anidado adentro y tocar
            "Términos" alternaba el modo en vez de abrir el link. */}
        {mode === "register" && (
          <motion.p className="text-[13px] text-faint text-center mt-4 leading-relaxed" variants={fadeUp}>
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
