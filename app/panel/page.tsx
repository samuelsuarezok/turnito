"use client";

// PANEL v3: teléfonos con link a WhatsApp + Config + auto-done
// REEMPLAZA TODO: app/panel/page.tsx

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { motion, AnimatePresence } from "framer-motion";

type Shop = { id: string; name: string; slug: string };
type Appt = {
  id: string; client_name: string; client_phone: string;
  date: string; time: string; status: string;
  services: { name: string; duration_min: number } | null;
};

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const EASE = [0.22, 1, 0.36, 1] as const;

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getNext7Days() {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
}

// Convierte "351 234-5678" en link de WhatsApp argentino
function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("54") ? digits : `549${digits}`;
  return `https://wa.me/${full}`;
}

export default function PanelPage() {
  const supabase = createClient();
  const router = useRouter();

  const [shop, setShop] = useState<Shop | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [date, setDate] = useState(fmtDate(new Date()));
  const [copied, setCopied] = useState(false);

  const days = useMemo(() => getNext7Days(), []);
  const today = fmtDate(new Date());

  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return router.push("/login");
      const { data } = await supabase.from("barbershops").select("id, name, slug").maybeSingle();
      if (!data) return router.push("/onboarding");
      setShop(data);

      // Marcar como atendidos los turnos confirmados de días pasados
      await supabase
        .from("appointments")
        .update({ status: "done" })
        .eq("barbershop_id", data.id)
        .eq("status", "confirmed")
        .lt("date", fmtDate(new Date()));
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAppts(shopId: string, onDate: string) {
    const { data } = await supabase
      .from("appointments")
      .select("id, client_name, client_phone, date, time, status, services(name, duration_min)")
      .eq("barbershop_id", shopId).eq("date", onDate).order("time");
    setAppts((data as unknown as Appt[]) ?? []);
  }

  useEffect(() => { if (shop) loadAppts(shop.id, date); /* eslint-disable-next-line */ }, [shop, date]);

  async function setStatus(id: string, status: string) {
    await supabase.from("appointments").update({ status }).eq("id", id);
    if (shop) loadAppts(shop.id, date);
  }

  function copyLink() {
    if (!shop) return;
    navigator.clipboard.writeText(`${window.location.origin}/${shop.slug}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const active = appts.filter((a) => a.status === "confirmed");
  const done = appts.filter((a) => a.status === "done");
  const current = active[0] ?? null;
  const rest = active.slice(1);

  if (!shop)
    return <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] flex items-center justify-center"><p className="text-[#5A5A54]">Cargando…</p></main>;

  return (
    <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] p-5">
      <div className="max-w-md mx-auto pb-16">
        {/* header */}
        <motion.div className="flex items-center justify-between pt-2 mb-1"
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
          <div className="flex items-center gap-2.5"><LogoMark size={22} /><h1 className="text-lg font-bold">{shop.name}</h1></div>
          <div className="flex items-center">
            <Link href="/panel/config" className="text-[11px] text-[#D8F34E] font-semibold mr-3">⚙ Config</Link>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }} className="text-[11px] text-[#5A5A54] underline">Salir</button>
          </div>
        </motion.div>
        <button onClick={copyLink} className="text-[11px] font-mono text-[#6E6E68] mb-6">
          turnito.app/{shop.slug} <span className={copied ? "text-[#D8F34E]" : "text-[#5A5A54]"}>{copied ? "✓ copiado" : "· copiar"}</span>
        </button>

        {/* días */}
        <motion.div className="flex gap-2 overflow-x-auto pb-2 mb-6"
          initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
          {days.map((d) => {
            const ds = fmtDate(d); const on = date === ds;
            return (
              <motion.button key={ds} onClick={() => setDate(ds)}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                whileTap={{ scale: 0.92 }}
                className={`shrink-0 w-12 rounded-2xl border-[1.5px] py-2 text-center transition-colors ${on ? "border-[#D8F34E] bg-[#D8F34E]/10" : "border-[#262626] bg-[#181818]"}`}>
                <div className={`text-[8px] uppercase ${on ? "text-[#D8F34E]" : "text-[#5A5A54]"}`}>{ds === today ? "Hoy" : DAYS_ES[d.getDay()]}</div>
                <div className={`text-sm font-bold ${on ? "text-[#D8F34E]" : ""}`}>{d.getDate()}</div>
              </motion.button>
            );
          })}
        </motion.div>

        <div className="flex justify-between items-baseline mb-4">
          <span className="text-sm font-bold">{date === today ? "Hoy" : date}</span>
          <span className="text-[11px] text-[#5A5A54]">{done.length} atendidos · {active.length} en cola</span>
        </div>

        {/* SIGUIENTE */}
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div key={current.id}
              initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -12 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="rounded-3xl bg-[#D8F34E] text-[#101010] p-5 mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[#101010] text-[#D8F34E] text-[8px] font-black tracking-[0.15em] px-3.5 py-1.5 rounded-bl-2xl">SIGUIENTE</div>
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold" style={{ fontFamily: "var(--font-grotesk)" }}>{current.time.slice(0, 5)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold truncate">{current.client_name}</div>
                  <div className="text-xs opacity-70 mt-0.5">
                    {current.services?.name} · {current.services?.duration_min} min ·{" "}
                    {/* Teléfono → abre WhatsApp */}
                    <a href={waLink(current.client_phone)} target="_blank" rel="noopener noreferrer"
                      className="underline font-semibold">
                      💬 {current.client_phone}
                    </a>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} onClick={() => setStatus(current.id, "done")}
                  className="flex-1 rounded-full bg-[#101010] text-[#D8F34E] font-bold text-sm py-3">✓ Listo, siguiente</motion.button>
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => setStatus(current.id, "no_show")}
                  className="rounded-full border-[1.5px] border-[#101010]/30 text-[#101010] text-xs font-bold px-5">No vino</motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-[#262626] bg-[#141414] p-8 text-center mb-4">
              <p className="text-sm font-bold">Sin turnos en cola</p>
              <p className="text-xs text-[#5A5A54] mt-1">{appts.length === 0 ? "Todavía no hay reservas para este día" : "¡Día completado!"}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SIGUEN DESPUÉS */}
        {rest.length > 0 && (
          <>
            <SectionLabel>Después siguen</SectionLabel>
            <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
              <AnimatePresence>
                {rest.map((a, i) => (
                  <motion.div key={a.id} layout
                    variants={{ hidden: { opacity: 0, x: 20 }, show: { opacity: 1, x: 0 } }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-3 rounded-2xl bg-[#141414] border border-[#262626] px-4 py-3 mb-2">
                    <div className="w-6 h-6 rounded-full bg-[#181818] border border-[#262626] text-[#6E6E68] text-[10px] font-bold flex items-center justify-center shrink-0">{i + 2}</div>
                    <div className="font-mono text-sm font-bold w-11 text-[#D8F34E]">{a.time.slice(0, 5)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{a.client_name}</div>
                      <div className="text-[10px] text-[#5A5A54]">
                        {a.services?.name} ·{" "}
                        <a href={waLink(a.client_phone)} target="_blank" rel="noopener noreferrer"
                          className="underline text-[#6E6E68] hover:text-[#D8F34E]">
                          💬 {a.client_phone}
                        </a>
                      </div>
                    </div>
                    <button onClick={() => setStatus(a.id, "cancelled_by_shop")} className="text-[#5A5A54] hover:text-red-400 text-sm px-1">✕</button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </>
        )}

        {/* YA ATENDIDOS */}
        {done.length > 0 && (
          <>
            <SectionLabel className="mt-6">Ya atendidos</SectionLabel>
            {done.map((a) => (
              <motion.div key={a.id} layout initial={{ opacity: 0 }} animate={{ opacity: 0.35 }}
                className="flex items-center gap-3 px-4 py-2">
                <span className="text-[#D8F34E] text-sm">✓</span>
                <span className="font-mono text-xs w-11">{a.time.slice(0, 5)}</span>
                <span className="text-sm line-through">{a.client_name}</span>
              </motion.div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2 ${className}`}>{children}</div>;
}
