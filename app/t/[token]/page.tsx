"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import { IcoCheck, IcoX } from "@/components/icons";
import * as ui from "@/lib/ui";
import { cap, fechaLarga } from "@/lib/fechas";

type Appt = {
  shop_name: string; client_name: string; service: string;
  date: string; time: string; status: string;
  can_cancel: boolean;
};

const EASE = [0.22, 1, 0.36, 1] as const;

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

  if (notFound) return <Center><p className="text-[15px] text-muted">Este link no corresponde a ningún turno.</p></Center>;
  if (!appt)
    return (
      <Center>
        <div className="w-full max-w-sm animate-pulse">
          <div className="h-7 w-24 rounded bg-surface mx-auto mb-8" />
          <div className="rounded-3xl border border-line bg-surface p-6">
            <div className="w-12 h-12 rounded-full bg-surface-2 mx-auto mb-4" />
            <div className="h-5 w-32 rounded bg-line mx-auto mb-2" />
            <div className="h-3 w-24 rounded bg-surface-2 mx-auto mb-6" />
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded bg-surface-2 mb-2" />)}
          </div>
        </div>
      </Center>
    );

  const cancelled = appt.status.startsWith("cancelled");
  const finished = appt.status === "done" || appt.status === "no_show";

  return (
    <Center>
      <motion.div className="w-full max-w-sm"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        {/* relative + absolute para que el logo quede centrado de verdad: si
            el toggle fuera su hermano en el flex, lo correría a la izquierda. */}
        <div className="relative flex justify-center mb-8">
          <Logo size={28} />
          <ThemeToggle className="absolute right-0 top-1/2 -translate-y-1/2" />
        </div>

        <div className={`${ui.card} p-6 ${cancelled ? "border-danger/40" : ""}`}>
          <div className="text-center mb-6">
            {/* Lima = turno reservado, igual que en la confirmación y en el
                panel del local. Cancelado, rojo suave. */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
              cancelled ? "bg-danger-soft text-danger" : "bg-highlight text-on-highlight"}`}>
              {cancelled ? <IcoX size={22} /> : <IcoCheck size={22} />}
            </div>
            <h1 className={`text-[22px] leading-7 font-semibold ${cancelled ? "text-danger" : "text-ink"}`}>
              {cancelled ? "Turno cancelado" : finished ? "Turno finalizado" : "Tu turno"}
            </h1>
            <p className="text-[14px] leading-5 text-muted mt-1">{appt.shop_name}</p>
          </div>

          <div>
            <Row label="Cliente" value={appt.client_name} strike={cancelled} />
            <Row label="Servicio" value={appt.service} strike={cancelled} />
            <Row label="Día" value={cap(fechaLarga(appt.date))} strike={cancelled} />
            <Row label="Hora" value={appt.time.slice(0, 5)} strike={cancelled} />
          </div>

          {cancelError && (
            <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`${ui.errorBox} mt-4`}>{cancelError}</motion.p>
          )}

          {/* Cancelable solo si está vigente Y dentro del límite */}
          {!cancelled && !finished && appt.can_cancel && (
            <div className="mt-6">
              <AnimatePresence mode="wait">
                {!confirmCancel ? (
                  <motion.button key="ask"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setConfirmCancel(true)}
                    className={`${ui.btnSecondary} w-full text-danger!`}>
                    Cancelar turno
                  </motion.button>
                ) : (
                  <motion.div key="confirm"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE }}>
                    <p className="text-[15px] leading-6 text-muted text-center mb-4">
                      ¿Seguro? El horario se libera para otra persona.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmCancel(false)} className={`${ui.btnSecondary} flex-1 px-4!`}>
                        No, lo mantengo
                      </button>
                      {/* text-surface y no text-white: en modo noche el rojo es
                          claro y el blanco encima no se leía. */}
                      <button onClick={cancel} disabled={cancelling} aria-busy={cancelling}
                        className="flex-1 h-12 rounded-full bg-danger text-surface text-[16px] font-semibold transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-50">
                        {cancelling ? "Cancelando…" : "Sí, cancelar"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Vigente pero fuera del límite de cancelación */}
          {!cancelled && !finished && !appt.can_cancel && (
            <p className="text-[15px] leading-6 text-muted text-center mt-6">
              Este turno ya no se puede cancelar online.<br />Si no llegás, avisale al local.
            </p>
          )}
        </div>

        <p className="text-center text-[14px] leading-5 text-muted mt-4">
          Guardá este link: es tu comprobante del turno.
        </p>
      </motion.div>
    </Center>
  );
}

function Row({ label, value, strike }: { label: string; value: string; strike?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-3 border-b border-line last:border-0 text-[16px] leading-6">
      <span className="text-muted">{label}</span>
      <span className={`font-medium text-right tabular-nums ${strike ? "line-through text-muted" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
      {children}
    </main>
  );
}
