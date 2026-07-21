"use client";



import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
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

  return (
    <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] flex items-center justify-center p-6">
      <motion.div className="w-full max-w-sm" variants={stagger} initial="hidden" animate="show">
        <motion.div className="flex justify-center mb-10" variants={fadeUp}>
          <Logo variant="dark" size={30} />
        </motion.div>

        <motion.div className="bg-[#141414] border border-[#262626] rounded-3xl p-7" variants={scaleIn}>
          <motion.h1 className="text-2xl font-bold mb-1" variants={fadeUp}>
            {mode === "register" ? "Creá tu barbería" : "Ingresá a tu panel"}
          </motion.h1>
          <motion.p className="text-sm text-[#6E6E68] mb-7" variants={fadeUp}>
            {mode === "register" ? (
              <><span className="text-[#D8F34E] font-semibold">7 días gratis</span> · sin tarjeta</>
            ) : ("Bienvenido de nuevo")}
          </motion.p>

          <motion.div variants={fadeUp}>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tunombre@gmail.com"
              className="w-full mb-4 rounded-2xl bg-[#181818] border border-[#262626] px-4 py-3.5 outline-none focus:border-[#D8F34E] transition-colors" />
          </motion.div>

          <motion.div variants={fadeUp}>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2">Contraseña</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo 6 caracteres"
              className="w-full mb-6 rounded-2xl bg-[#181818] border border-[#262626] px-4 py-3.5 outline-none focus:border-[#D8F34E] transition-colors" />
          </motion.div>

          {error && (
            <motion.p className="text-sm text-red-400 mb-4" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              {error}
            </motion.p>
          )}

          <motion.button
            variants={fadeUp}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={loading || !email.includes("@") || pass.length < 6}
            className="w-full rounded-full bg-[#D8F34E] text-[#101010] font-bold py-3.5 disabled:opacity-30"
          >
            {loading ? "…" : mode === "register" ? "Crear cuenta →" : "Ingresar →"}
          </motion.button>

          {/* ¿Olvidaste tu contraseña? — solo en modo login */}
          {mode === "login" && (
            <motion.p className="text-center mt-4" variants={fadeUp}>
              <Link href="/recuperar" className="text-xs text-[#5A5A54] underline hover:text-[#D8F34E] transition-colors">
                ¿Olvidaste tu contraseña?
              </Link>
            </motion.p>
          )}
        </motion.div>

        <motion.p className="text-sm text-[#6E6E68] mt-6 text-center" variants={fadeUp}>
          {mode === "register" ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?"}{" "}
          <button onClick={() => setMode(mode === "register" ? "login" : "register")} className="text-[#D8F34E] font-semibold">
            {mode === "register" ? "Ingresá" : "Registrate gratis"}
          </button>
        </motion.p>
      </motion.div>
    </main>
  );
}