"use client";

// LINK MÁGICO ANIMADO — REEMPLAZA: app/t/[token]/page.tsx

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { motion, AnimatePresence } from "framer-motion";

type Appt = {
  shop_name: string; client_name: string; service: string;
  date: string; time: string; status: string;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const rowStagger = { show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } };
const rowItem = { hidden: { opacity: 0, x: -14 }, show: { opacity: 1, x: 0 } };

export default function MagicLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const supabase = createClient();

  const [appt, setAppt] = useState<Appt | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  function load() {
    supabase.rpc("public_appointment_by_token", { t: token }).then(({ data, error }) => {
      if (error || !data) setNotFound(true);
      else setAppt(data as Appt);
    });
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  async function cancel() {
    setCancelling(true);
    await supabase.rpc("public_cancel_by_token", { t: token });
    setCancelling(false);
    setConfirmCancel(false);
    load();
  }

  if (notFound) return <Center><p className="text-[#6E6E68]">Este link no corresponde a ningún turno.</p></Center>;
  if (!appt) return <Center><p className="text-[#5A5A54]">Cargando…</p></Center>;

  const cancelled = appt.status.startsWith("cancelled");
  const finished = appt.status === "done" || appt.status === "no_show";

  return (
    <Center>
      <div className="w-full max-w-sm">
        <motion.div className="flex justify-center mb-8"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <Logo variant="dark" size={28} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className={`rounded-3xl border p-6 bg-[#141414] ${cancelled ? "border-red-900/50" : "border-[#262626]"}`}>
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
              className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3 ${
                cancelled ? "bg-red-900/20 text-red-400" : "bg-[#D8F34E] text-[#101010]"
              }`}>
              {cancelled ? "✕" : "✓"}
            </motion.div>
            <h1 className={`text-lg font-bold ${cancelled ? "text-red-400" : ""}`}>
              {cancelled ? "Turno cancelado" : finished ? "Turno finalizado" : "Tu turno"}
            </h1>
            <p className="text-[11px] text-[#5A5A54] mt-1">{appt.shop_name}</p>
          </div>

          <motion.div variants={rowStagger} initial="hidden" animate="show">
            <Row label="Cliente" value={appt.client_name} strike={cancelled} />
            <Row label="Servicio" value={appt.service} strike={cancelled} />
            <Row label="Día" value={appt.date} strike={cancelled} />
            <Row label="Hora" value={`${appt.time.slice(0, 5)} hs`} strike={cancelled} highlight={!cancelled} />
          </motion.div>

          {!cancelled && !finished && (
            <div className="mt-6">
              <AnimatePresence mode="wait">
                {!confirmCancel ? (
                  <motion.button key="ask"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setConfirmCancel(true)}
                    className="w-full rounded-full border-[1.5px] border-red-900/50 text-red-400 text-sm font-bold py-3">
                    Cancelar turno
                  </motion.button>
                ) : (
                  <motion.div key="confirm"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    transition={{ ease: EASE }}>
                    <p className="text-xs text-[#6E6E68] text-center mb-3">
                      ¿Seguro? El horario se libera para otra persona.
                    </p>
                    <div className="flex gap-2">
                      <motion.button whileTap={{ scale: 0.96 }} onClick={() => setConfirmCancel(false)}
                        className="flex-1 rounded-full border-[1.5px] border-[#333] text-[#C9C9C4] text-sm font-bold py-3">
                        No, lo mantengo
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.96 }} onClick={cancel} disabled={cancelling}
                        className="flex-1 rounded-full bg-red-900/30 border-[1.5px] border-red-900/50 text-red-300 text-sm font-bold py-3 disabled:opacity-50">
                        {cancelling ? "…" : "Sí, cancelar"}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="text-center text-[11px] text-[#5A5A54] mt-4">
          Guardá este link: es tu comprobante del turno.
        </motion.p>
      </div>
    </Center>
  );
}

function Row({ label, value, strike, highlight }: { label: string; value: string; strike?: boolean; highlight?: boolean }) {
  return (
    <motion.div variants={rowItem} className="flex justify-between py-2.5 border-b border-[#262626] last:border-0 text-sm">
      <span className="text-[#5A5A54]">{label}</span>
      <span className={`font-semibold ${strike ? "line-through text-[#5A5A54]" : highlight ? "text-[#D8F34E]" : ""}`}>{value}</span>
    </motion.div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] flex items-center justify-center p-6">
      {children}
    </main>
  );
}
