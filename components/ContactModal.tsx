"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { RUBROS_LISTA } from "@/lib/rubros";
import { CONTACT_TO, WHATSAPP_URL } from "@/lib/contacto";

const EASE = [0.22, 1, 0.36, 1] as const;

const inputCls =
  "w-full rounded-2xl bg-surface-2 border border-line px-4 py-3 text-[15px] text-body outline-none focus:border-accent transition-colors";
const labelCls =
  "block text-[10px] font-bold uppercase tracking-widest text-faint mb-1.5";

type Estado = "form" | "enviado" | "sinMail";

export default function ContactModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rubro, setRubro] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState<Estado>("form");

  const firstField = useRef<HTMLInputElement>(null);

  // El foco va al primer campo SÓLO al abrir, y el fondo no scrollea mientras
  // esté abierto. Depende de `open` y de NADA más.
  //
  // Acá estaba un bug feo: esto vivía junto con el listener de Escape, en un
  // efecto que dependía también de `onClose`. La landing le pasa una función
  // nueva en cada render (`onClose={() => setContactOpen(false)}`) y rota su
  // mockup con un setInterval cada 3,4 segundos. Resultado: cada 3,4 segundos
  // cambiaba la identidad de `onClose`, se re-ejecutaba el efecto y el foco
  // volvía al campo "nombre" — mientras el visitante estaba escribiendo su mail
  // o su consulta. Separar los dos efectos lo corta de raíz, sin depender de
  // que el padre memorice la función.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => firstField.current?.focus(), 120);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape cierra. Este sí depende de `onClose`, y está bien: re-suscribir un
  // listener de teclado es barato y así siempre llama a la última versión.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send() {
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, rubro, message, website }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // El mail todavía no está configurado: no fingimos que salió. Le damos
        // al visitante las dos salidas que sí funcionan hoy.
        if (json.code === "EMAIL_NOT_CONFIGURED" || json.code === "SEND_FAILED") {
          setEstado("sinMail");
          return;
        }
        setError(json.error ?? "No pudimos enviar tu consulta. Probá de nuevo.");
        return;
      }
      setEstado("enviado");
    } catch {
      setEstado("sinMail");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setName(""); setEmail(""); setRubro(""); setMessage("");
    setError(""); setEstado("form");
  }

  const puedeEnviar =
    name.trim().length >= 2 && email.includes("@") && message.trim().length >= 10;

  // El asunto ya escrito, para la salida por mail directo.
  const mailtoHref =
    `mailto:${CONTACT_TO}?subject=${encodeURIComponent("Consulta sobre Turnito")}` +
    `&body=${encodeURIComponent(message.trim() || "Hola, quería consultarles sobre Turnito.")}`;

  // El modal se monta con un portal en <body>. NO es un detalle de estilo:
  // app/template.tsx envuelve cada página en un motion.div que anima `y` y
  // `filter`, y un ancestro con transform o filter crea un contenedor de
  // posicionamiento propio — ahí `position: fixed` deja de medirse contra la
  // ventana y pasa a medirse contra ese div, que es tan alto como la página
  // entera. El modal terminaba centrado en el medio del documento en vez de
  // la pantalla. Framer además deja `filter: blur(0px)` puesto al terminar,
  // así que el efecto no se iba solo.
  //
  // En el server no hay document. Como el modal arranca cerrado, tanto el
  // server como el primer render del cliente devuelven null: no hay
  // diferencia de hidratación que arreglar.
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog" aria-modal="true" aria-label="Contacto"
          className="fixed inset-0 z-[200] bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-6"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-surface rounded-t-[28px] sm:rounded-[28px] max-h-[92vh] overflow-y-auto"
          >
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 mb-1">
                <h2 className="text-[26px] font-extrabold text-ink tracking-tight leading-tight">
                  {estado === "enviado" ? "¡Listo, nos llegó!"
                    : estado === "sinMail" ? "Escribinos directo"
                    : "Contanos qué necesitás"}
                </h2>
                <button onClick={onClose} aria-label="Cerrar"
                  className="shrink-0 w-9 h-9 rounded-full bg-canvas text-muted text-lg leading-none hover:bg-line transition-colors">
                  ✕
                </button>
              </div>

              {/* ── enviado ── */}
              {estado === "enviado" && (
                <div className="mt-2">
                  <p className="text-[15px] text-muted">
                    Te respondemos a <span className="font-bold text-ink">{email.trim()}</span>,
                    normalmente dentro de las 24 horas.
                  </p>
                  <button onClick={() => { reset(); onClose(); }}
                    className="mt-6 w-full rounded-full bg-accent text-on-accent font-bold py-3.5">
                    Cerrar
                  </button>
                </div>
              )}

              {/* ── el mail no salió: salidas reales ── */}
              {estado === "sinMail" && (
                <div className="mt-2">
                  <p className="text-[15px] text-muted">
                    No pudimos enviar el formulario desde acá. Estas dos vías sí funcionan
                    y las miramos igual de seguido:
                  </p>
                  <div className="flex flex-col gap-2.5 mt-5">
                    <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
                      className="w-full rounded-full bg-highlight text-on-highlight font-bold py-3.5 text-center">
                      Escribirnos por WhatsApp
                    </a>
                    <a href={mailtoHref}
                      className="w-full rounded-full border border-line text-ink font-bold py-3.5 text-center">
                      Abrir mi mail
                    </a>
                  </div>
                  <p className="text-xs text-faint mt-4 text-center">
                    O copiá la dirección: <span className="font-mono text-accent-ink">{CONTACT_TO}</span>
                  </p>
                </div>
              )}

              {/* ── formulario ── */}
              {estado === "form" && (
                <>
                  <p className="text-[15px] text-muted mb-6">
                    Dudas, precios, si te sirve para tu rubro. Te contestamos por mail.
                  </p>

                  <div className="flex flex-col gap-4">
                    <div>
                      <label className={labelCls} htmlFor="c-nombre">Tu nombre</label>
                      <input id="c-nombre" ref={firstField} value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Sofía Ramírez" className={inputCls} />
                    </div>

                    <div>
                      <label className={labelCls} htmlFor="c-email">Tu email</label>
                      <input id="c-email" type="email" inputMode="email" autoComplete="email"
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="sofia@gmail.com" className={inputCls} />
                    </div>

                    <div>
                      <label className={labelCls} htmlFor="c-rubro">
                        Tu rubro <span className="text-faint normal-case tracking-normal">— opcional</span>
                      </label>
                      <select id="c-rubro" value={rubro} onChange={(e) => setRubro(e.target.value)}
                        className={inputCls}>
                        <option value="">Elegí uno</option>
                        {RUBROS_LISTA.map((r) => (
                          <option key={r.id} value={r.label}>{r.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={labelCls} htmlFor="c-msg">Tu consulta</label>
                      <textarea id="c-msg" value={message} rows={4}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Hola, tengo un estudio de uñas y quería saber si…"
                        className={`${inputCls} resize-y min-h-[110px]`} />
                    </div>

                    {/* Honeypot: invisible para personas, tentador para bots. */}
                    <input type="text" name="website" value={website} tabIndex={-1}
                      autoComplete="off" aria-hidden="true"
                      onChange={(e) => setWebsite(e.target.value)}
                      className="absolute w-px h-px opacity-0 -z-10 pointer-events-none" />

                    {error && <p className="text-sm text-danger">{error}</p>}

                    <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      onClick={send} disabled={!puedeEnviar || sending}
                      className="w-full rounded-full bg-accent text-on-accent font-bold py-3.5 disabled:opacity-25 transition-opacity">
                      {sending ? "Enviando…" : "Enviar consulta →"}
                    </motion.button>

                    <p className="text-xs text-faint text-center">
                      ¿Preferís WhatsApp?{" "}
                      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
                        className="text-accent-ink font-bold underline">
                        Escribinos por acá
                      </a>
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
