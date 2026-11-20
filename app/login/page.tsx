"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { traducirErrorAuth } from "@/lib/auth-errors";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, EASE } from "@/components/motion";

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

  // Es un <form> de verdad para que Enter envíe y para que el gestor de
  // contraseñas del navegador ofrezca guardar y completar. `noValidate` apaga
  // los globitos nativos del navegador: los errores los damos nosotros, en
  // español y debajo de cada campo.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const next = validate();
    setErrors(next);
    if (next.email || next.pass) return;

    setLoading(true);
    // Minúsculas SIEMPRE: "Pablo@Gmail.com" y "pablo@gmail.com" son la misma
    // cuenta; sin normalizar, un typo de mayúscula crea usuarios distintos.
    const mail = email.trim().toLowerCase();
    const { error } =
      mode === "register"
        ? await supabase.auth.signUp({ email: mail, password: pass })
        : await supabase.auth.signInWithPassword({ email: mail, password: pass });
    setLoading(false);
    if (error) return setErrors({ form: traducirErrorAuth(error) });
    router.push(mode === "register" ? "/onboarding" : "/panel");
  }

  function switchMode() {
    setMode(mode === "register" ? "login" : "register");
    setErrors({});
  }

  const registro = mode === "register";

  const inputCls =
    "w-full h-12 rounded-xl bg-surface-2 border px-4 text-[16px] text-ink placeholder:text-faint " +
    "outline-none transition-[border-color,box-shadow] duration-150";
  const okCls = "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--c-accent-soft)]";
  const badCls = "border-danger focus:shadow-[0_0_0_3px_var(--c-danger-soft)]";
  const labelCls = "block text-[14px] leading-5 font-medium text-body mb-2";
  const fieldErrCls = "text-[14px] leading-5 text-danger mt-2";

  return (
    <main className="min-h-screen bg-canvas text-body flex items-center justify-center p-6">
      {/* Una sola entrada: la columna entera aparece con un fade corto. */}
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        {/* El logo queda centrado y el toggle se apoya en el borde derecho de
            la columna: si fueran hermanos en un flex, el logo se correría. */}
        <div className="relative flex justify-center mb-8">
          <Logo size={28} />
          <ThemeToggle className="absolute right-0 top-1/2 -translate-y-1/2" />
        </div>

        <form onSubmit={handleSubmit} noValidate className="bg-surface border border-line rounded-3xl p-8">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-ink">
            {registro ? "Creá tu cuenta" : "Ingresá a tu panel"}
          </h1>
          {registro && (
            <p className="text-[15px] leading-6 text-muted mt-2 text-balance">30 días gratis, sin tarjeta y sin permanencia</p>
          )}

          <div className="mt-8 mb-5">
            <label className={labelCls} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
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
          </div>

          <div className="mb-6">
            <label className={labelCls} htmlFor="pass">Contraseña</label>
            <input
              id="pass"
              type="password"
              // new-password hace que el navegador proponga una contraseña
              // segura al registrarse; current-password, que complete la guardada.
              autoComplete={registro ? "new-password" : "current-password"}
              value={pass}
              onChange={(e) => {
                setPass(e.target.value);
                if (errors.pass) setErrors({ ...errors, pass: undefined });
              }}
              placeholder={registro ? "Mínimo 6 caracteres" : undefined}
              aria-invalid={!!errors.pass}
              aria-describedby={errors.pass ? "pass-error" : undefined}
              className={`${inputCls} ${errors.pass ? badCls : okCls}`}
            />
            {errors.pass && <p id="pass-error" className={fieldErrCls}>{errors.pass}</p>}
          </div>

          {errors.form && (
            <motion.p
              role="alert"
              className="text-[14px] leading-5 text-danger bg-danger-soft rounded-xl px-4 py-3 mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, ease: EASE }}
            >
              {errors.form}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className={
              "w-full h-12 rounded-full bg-accent text-on-accent text-[16px] font-semibold " +
              "transition-[background-color,transform] duration-150 hover:bg-[var(--c-accent-hover)] " +
              "active:scale-[0.98] disabled:opacity-60 " +
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            }
          >
            {loading ? (registro ? "Creando cuenta…" : "Ingresando…") : registro ? "Crear cuenta" : "Ingresar"}
          </button>

          {/* ¿Olvidaste tu contraseña? — solo en modo login */}
          {!registro && (
            <p className="text-center mt-4">
              <Link href="/recuperar" className="text-[14px] text-muted underline underline-offset-2 hover:text-ink transition-colors">
                ¿Olvidaste tu contraseña?
              </Link>
            </p>
          )}
        </form>

        <p className="text-[15px] leading-6 text-muted mt-6 text-center">
          {registro ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?"}{" "}
          <button type="button" onClick={switchMode} className="font-semibold text-accent-ink hover:underline underline-offset-2">
            {registro ? "Ingresá" : "Registrate gratis"}
          </button>
        </p>

        {/* Fuera del botón de arriba: antes estaba anidado adentro y tocar
            "Términos" alternaba el modo en vez de abrir el link. */}
        {registro && (
          <p className="text-[13px] leading-5 text-muted text-center mt-4">
            Al crear tu cuenta aceptás los{" "}
            <Link href="/legales" className="underline underline-offset-2 hover:text-ink transition-colors">
              Términos y la Política de Privacidad
            </Link>
          </p>
        )}
      </motion.div>
    </main>
  );
}
