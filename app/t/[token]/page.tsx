"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { motion, AnimatePresence } from "framer-motion";

type Appt = {
  shop_name: string; client_name: string; service: string;
  date: string; time: string; status: string;
  can_cancel: boolean;
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
  const [cancelError, setCancelError] = useState("");

  function load() {
    // .then(onSuccess, onError): el 2do arg captura el rechazo de la promesa.
    // Sin manejar el error, una promesa rechazada (ej: sin red) dejaba la
    // pantalla trabada en "Cargando…" para siempre, sin avisar.
    supabase.rpc("public_appointment_by_token", { t: token }).then(
      ({ data, error }) => {
        if (error || !data) setNotFound(true);
        else setAppt(data as Appt);
      },
      () => setNotFound(true)
    );
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  async function cancel() {
    setCancelling(true);
    setCancelError("");
    try {
      const { data } = await supabase.rpc("public_cancel_by_token", { t: token });
      if (data && (data as { ok: boolean }).ok === false) {
        setCancelError("Ya no se puede cancelar online. Comunicate con el local.");
      }
      load();
    } catch {
      // Si la RPC EXPLOTA (no que devuelva ok:false, sino que falle la red),
      // avisamos en vez de dejar el botón girando infinito.
      setCancelError("No pudimos procesar la cancelación. Revisá tu conexión e intentá de nuevo.");
    } finally {
      // finally = SIEMPRE corre, pase lo que pase: el spinner se apaga aunque haya error.
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  if (notFound) return <Center><p className="text-[#5E6470]">Este link no corresponde a ningún turno.</p></Center>;
  if (!appt)
    return (
      <Center>
        <div className="w-full max-w-sm animate-pulse">
          <div className="h-7 w-24 rounded bg-white mx-auto mb-8" />
          <div className="rounded-3xl border border-[#E3E5E9] bg-white p-6">
            <div className="w-12 h-12 rounded-full bg-[#E9EAEE] mx-auto mb-3" />
            <div className="h-5 w-32 rounded bg-[#E9EAEE] mx-auto mb-2" />
            <div className="h-3 w-24 rounded bg-[#EFF0F2] mx-auto mb-6" />
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded bg-[#F4F5F7] mb-2" />)}
          </div>
        </div>
      </Center>
    );

  const cancelled = appt.status.startsWith("cancelled");
  const finished = appt.status === "done" || appt.status === "no_show";

  return (
    <Center>
      <div className="w-full max-w-sm">
        <motion.div className="flex justify-center mb-8"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <Logo variant="light" size={28} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className={`rounded-3xl border p-6 bg-white ${cancelled ? "border-red-200" : "border-[#E3E5E9]"}`}>
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
              className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3 ${
                cancelled ? "bg-red-50 text-red-500" : "bg-[#B4EC5C] text-black"
              }`}>
              {cancelled ? "✕" : "✓"}
            </motion.div>
            <h1 className={`text-lg font-extrabold ${cancelled ? "text-red-500" : "text-black"}`}>
              {cancelled ? "Turno cancelado" : finished ? "Turno finalizado" : "Tu turno"}
            </h1>
            <p className="text-[11px] text-[#9AA0AA] mt-1">{appt.shop_name}</p>
          </div>

          <motion.div variants={rowStagger} initial="hidden" animate="show">
            <Row label="Cliente" value={appt.client_name} strike={cancelled} />
            <Row label="Servicio" value={appt.service} strike={cancelled} />
            <Row label="Día" value={appt.date} strike={cancelled} />
            <Row label="Hora" value={`${appt.time.slice(0, 5)} hs`} strike={cancelled} highlight={!cancelled} />
          </motion.div>

          {cancelError && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-xs text-amber-600 text-center mt-4">{cancelError}</motion.p>
          )}

          {/* Cancelable solo si está vigente Y dentro del límite */}
          {!cancelled && !finished && appt.can_cancel && (
            <div className="mt-6">
              <AnimatePresence mode="wait">
                {!confirmCancel ? (
                  <motion.button key="ask"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setConfirmCancel(true)}
                    className="w-full rounded-full border-[1.5px] border-red-200 text-red-500 text-sm font-bold py-3">
                    Cancelar turno
                  </motion.button>
                ) : (
                  <motion.div key="confirm"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    transition={{ ease: EASE }}>
                    <p className="text-xs text-[#5E6470] text-center mb-3">
                      ¿Seguro? El horario se libera para otra persona.
                    </p>
                    <div className="flex gap-2">
                      <motion.button whileTap={{ scale: 0.96 }} onClick={() => setConfirmCancel(false)}
                        className="flex-1 rounded-full border-[1.5px] border-[#E3E5E9] text-[#1C1F26] text-sm font-bold py-3">
                        No, lo mantengo
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.96 }} onClick={cancel} disabled={cancelling}
                        className="flex-1 rounded-full bg-red-500 text-white text-sm font-bold py-3 disabled:opacity-50">
                        {cancelling ? "…" : "Sí, cancelar"}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Vigente pero fuera del límite de cancelación */}
          {!cancelled && !finished && !appt.can_cancel && (
            <p className="text-xs text-[#9AA0AA] text-center mt-6">
              Este turno ya no se puede cancelar online.<br />Si no llegás, avisale al local.
            </p>
          )}
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="text-center text-[11px] text-[#9AA0AA] mt-4">
          Guardá este link: es tu comprobante del turno.
        </motion.p>
      </div>
    </Center>
  );
}

function Row({ label, value, strike, highlight }: { label: string; value: string; strike?: boolean; highlight?: boolean }) {
  return (
    <motion.div variants={rowItem} className="flex justify-between py-2.5 border-b border-[#E3E5E9] last:border-0 text-sm">
      <span className="text-[#9AA0AA]">{label}</span>
      <span className={`font-bold ${strike ? "line-through text-[#9AA0AA]" : highlight ? "text-[#014CFF]" : "text-black"}`}>{value}</span>
    </motion.div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F0F1F3] flex items-center justify-center p-6">
      {children}
    </main>
  );
}
