"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, type Variants } from "framer-motion";
import { LogoMark } from "@/components/Logo";
import ContactModal from "@/components/ContactModal";
import ThemeToggle from "@/components/ThemeToggle";
import WhatsAppFab from "@/components/WhatsAppFab";
import { SITE_DOMAIN } from "@/lib/site";
import { WHATSAPP_URL } from "@/lib/contacto";
import { motion, Reveal, RevealGroup, Item, SplitText, EASE } from "@/components/motion";

// ─────────────────────────────────────────────────────────────────────
// Reglas de la landing (pasada de "unslop", ver el historial del commit):
//
// · El azul es la birome y el lima es el resaltador. El lima marca UNA cosa:
//   el turno que sigue (la tarjeta "Siguiente", igual que en el panel real).
//   No se usa para decorar nada más.
// · El azul de fondo vive sólo en el hero y en el cierre. El resto de la
//   página son superficies neutras: el color va al contenido, no al chrome.
// · Todos los espacios son múltiplos de 4. Pesos 400/500/600, nada de 800.
// · Rótulos en tipo oración, nunca en mayúsculas espaciadas.
// · Una sola entrada al cargar: la cascada del titular. El resto aparece con
//   un fade corto al scrollear. Nada flota ni gira en loop.
// ─────────────────────────────────────────────────────────────────────

const css = `
.ld{box-sizing:border-box;background:var(--c-canvas);color:var(--c-body);font-family:var(--font-urbanist),sans-serif;font-size:16px;line-height:1.6}
.ld *{box-sizing:border-box;margin:0;padding:0}
.ld h1,.ld h2,.ld h3{color:var(--c-ink)}
.ld ::selection{background:var(--c-highlight);color:var(--c-on-highlight)}
.ld a{text-decoration:none;color:inherit}
.ld button{font-family:inherit;cursor:pointer}
.ld a:focus-visible,.ld button:focus-visible,.ld summary:focus-visible{outline:2px solid var(--c-accent);outline-offset:2px}
.ld .mono{font-family:var(--font-mono),monospace;font-size:.9em;color:var(--c-ink)}
.ld .wrap{max-width:1200px;margin:0 auto}

/* BOTONES */
.ld .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 24px;border-radius:999px;border:1px solid transparent;font-size:16px;font-weight:600;white-space:nowrap;transition:background-color .15s cubic-bezier(.22,1,.36,1),border-color .15s cubic-bezier(.22,1,.36,1),transform .15s cubic-bezier(.22,1,.36,1)}
.ld .btn:active{transform:scale(.98)}
.ld .btn-sm{height:36px;padding:0 16px;font-size:14px}
.ld .btn-primary{background:var(--c-accent);color:var(--c-on-accent)}
.ld .btn-primary:hover{background:var(--c-accent-hover)}
.ld .btn-ghost{background:var(--c-surface);color:var(--c-ink);border-color:var(--c-line)}
.ld .btn-ghost:hover{background:var(--c-surface-2);border-color:color-mix(in srgb,var(--c-ink) 20%,transparent)}
.ld .btn-on-block{background:var(--c-on-block);color:var(--c-block)}
.ld .btn-on-block:hover{background:color-mix(in srgb,var(--c-on-block) 88%,var(--c-block))}

/* NAV */
.ld nav{position:sticky;top:0;z-index:100;padding:0 24px;background:var(--c-canvas);border-bottom:1px solid var(--c-line)}
.ld .nav-in{height:64px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.ld .logo{display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:var(--c-ink)}
.ld .nav-links{display:flex;gap:32px;font-size:14px;font-weight:500}
.ld .nav-links a{color:var(--c-muted);transition:color .15s}
.ld .nav-links a:hover{color:var(--c-ink)}
.ld .nav-r{display:flex;align-items:center;gap:12px}

/* HERO */
.ld .hero{padding:48px 24px 0}
.ld .hero-in{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:48px;align-items:center}
.ld .display{font-size:clamp(44px,6.4vw,84px);font-weight:600;letter-spacing:-0.03em;line-height:1.02;text-wrap:balance}
.ld .display .b{color:var(--c-accent-ink)}
.ld .hero-sub{font-size:18px;line-height:28px;color:var(--c-muted);max-width:30rem;margin-top:24px}
.ld .hero-ctas{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}
.ld .hero-fine{font-size:13px;color:var(--c-muted);margin-top:16px}

/* Escenario: el ejemplo del cliente reservando y lo que ves vos */
.ld .stage{background:var(--c-block);border-radius:28px;padding:24px;position:relative;overflow:hidden;height:560px;display:flex;flex-direction:column}
.ld .tabs{display:flex;gap:4px;padding:4px;border-radius:999px;background:var(--c-block-line);align-self:flex-start;max-width:100%;overflow-x:auto;scrollbar-width:none}
.ld .tabs::-webkit-scrollbar{display:none}
.ld .tab{height:32px;padding:0 16px;border-radius:999px;border:none;background:transparent;color:var(--c-on-block-soft);font-size:14px;font-weight:500;white-space:nowrap;transition:background-color .15s,color .15s}
.ld .tab:hover{color:var(--c-on-block)}
.ld .tab[aria-pressed="true"]{background:var(--c-on-block);color:var(--c-block)}
.ld .scene{position:relative;flex:1;margin-top:24px}

/* teléfono */
.ld .phone{position:absolute;left:8%;bottom:-48px;width:280px;background:var(--c-block-card);border-radius:40px;padding:10px;box-shadow:0 24px 48px rgba(0,0,0,.18)}
.ld .notch{width:96px;height:24px;background:#0a0a0a;border-radius:999px;margin:4px auto 8px}
.ld .screen{background:var(--c-canvas);border-radius:30px;padding:16px 16px 24px}
.ld .scr-shop{font-weight:600;font-size:16px;line-height:20px;color:var(--c-ink)}
.ld .scr-sub{font-size:11px;line-height:16px;color:var(--c-muted);font-family:var(--font-mono),monospace;margin-top:2px}
.ld .scr-label{font-size:12px;line-height:16px;font-weight:500;color:var(--c-muted);margin:16px 0 8px}
.ld .chiprow{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.ld .chip{background:var(--c-surface);border:1px solid var(--c-line);border-radius:12px;padding:8px 4px;text-align:center}
.ld .chip.on{border-color:var(--c-accent);background:var(--c-accent-soft)}
.ld .chip b{display:block;font-size:12px;line-height:16px;color:var(--c-ink);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ld .chip span{display:block;font-size:11px;line-height:16px;color:var(--c-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.ld .chip.on span{color:var(--c-accent-ink)}
.ld .dayrow{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
.ld .day{background:var(--c-surface);border:1px solid var(--c-line);border-radius:12px;padding:4px 0;text-align:center}
.ld .day.on{border-color:var(--c-accent);background:var(--c-accent-soft)}
.ld .day em{display:block;font-style:normal;font-size:11px;line-height:16px;color:var(--c-muted)}
.ld .day b{display:block;font-size:14px;line-height:20px;font-weight:600;color:var(--c-ink);font-variant-numeric:tabular-nums}
.ld .day.on em,.ld .day.on b{color:var(--c-accent-ink)}
.ld .slotgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.ld .slot{background:var(--c-surface);border:1px solid var(--c-line);border-radius:12px;height:32px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:var(--c-body);font-variant-numeric:tabular-nums}
.ld .slot.on{background:var(--c-accent);border-color:var(--c-accent);color:var(--c-on-accent)}
.ld .slot.off{opacity:.4;text-decoration:line-through}
.ld .scr-btn{margin-top:16px;background:var(--c-accent);color:var(--c-on-accent);border-radius:999px;height:40px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}

/* tarjeta "Siguiente": la misma del panel, con el turno recién reservado */
.ld .next-wrap{position:absolute;right:4%;top:160px;width:272px;z-index:2}
.ld .next-cap{font-size:13px;line-height:20px;color:var(--c-on-block-soft);margin-bottom:8px;text-align:right}
.ld .next{background:var(--c-highlight);color:var(--c-on-highlight);border-radius:20px;padding:20px;box-shadow:0 24px 48px rgba(0,0,0,.16)}
.ld .next-top{display:flex;justify-content:space-between;font-size:13px;line-height:20px;font-weight:600}
.ld .next-top span{opacity:.6;font-weight:500}
.ld .next-row{display:flex;align-items:center;gap:16px;margin-top:12px}
.ld .next-time{font-size:32px;line-height:1;font-weight:600;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}
.ld .next-name{font-size:18px;line-height:24px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ld .next-svc{font-size:14px;line-height:20px;opacity:.7}
.ld .next-btn{margin-top:16px;height:40px;border-radius:999px;background:var(--c-on-highlight);color:var(--c-highlight);display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:600}

/* SECCIONES */
.ld section{padding:96px 24px 0;scroll-margin-top:64px}
.ld .label{font-size:14px;line-height:20px;font-weight:500;color:var(--c-muted);margin-bottom:12px}
.ld h2{font-size:clamp(32px,4vw,48px);font-weight:500;letter-spacing:-0.025em;line-height:1.08;max-width:640px;text-wrap:balance}
.ld .sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:32px;flex-wrap:wrap;margin-bottom:40px}
.ld .sec-head p{max-width:360px;color:var(--c-muted);font-size:16px;line-height:24px}

/* qué es */
.ld .about{background:var(--c-surface);border-radius:24px;padding:56px}
.ld .lead{font-size:clamp(24px,3vw,36px);font-weight:500;letter-spacing:-0.02em;line-height:1.25;color:var(--c-muted);max-width:880px}
.ld .lead b{font-weight:500;color:var(--c-ink)}
.ld .statrow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px;margin-top:48px;padding-top:32px;border-top:1px solid var(--c-line)}
.ld .stat b{display:block;font-size:40px;line-height:1;font-weight:500;letter-spacing:-0.02em;color:var(--c-ink);font-variant-numeric:tabular-nums}
.ld .stat span{display:block;font-size:14px;line-height:20px;color:var(--c-muted);margin-top:8px}

/* qué incluye: un solo panel partido con hairlines, no cuatro tarjetas iguales */
.ld .fpanel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));background:var(--c-surface);border-radius:24px;overflow:hidden}
.ld .fcell{padding:32px 28px;border-left:1px solid var(--c-line)}
.ld .fcell:first-child{border-left:none}
.ld .ficon{width:40px;height:40px;border-radius:12px;background:var(--c-surface-2);border:1px solid var(--c-line);display:flex;align-items:center;justify-content:center;color:var(--c-muted);margin-bottom:24px}
.ld .fcell h3{font-size:18px;line-height:24px;font-weight:600;margin-bottom:8px}
.ld .fcell p{font-size:15px;line-height:24px;color:var(--c-muted)}

/* cómo funciona: una línea de tiempo, no otra grilla de tarjetas */
.ld .steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px}
.ld .step{position:relative;padding-top:56px}
.ld .step::before{content:'';position:absolute;top:16px;left:40px;right:-32px;height:1px;background:var(--c-line)}
.ld .step:last-child::before{display:none}
.ld .step-n{position:absolute;top:0;left:0;width:32px;height:32px;border-radius:999px;border:1px solid var(--c-line);background:var(--c-surface);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono),monospace;font-size:13px;color:var(--c-ink)}
.ld .step h3{font-size:18px;line-height:24px;font-weight:600;margin-bottom:8px}
.ld .step p{font-size:15px;line-height:24px;color:var(--c-muted);max-width:340px}

/* faq */
.ld .faq-grid{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,8fr);gap:48px;align-items:start}
.ld .faq{display:flex;flex-direction:column;gap:8px}
.ld details{background:var(--c-surface);border-radius:16px}
.ld summary{padding:20px 24px;cursor:pointer;font-size:16px;line-height:24px;font-weight:500;color:var(--c-ink);list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;border-radius:16px}
.ld summary::-webkit-details-marker{display:none}
.ld .plus{color:var(--c-muted);flex-shrink:0;transition:transform .18s cubic-bezier(.22,1,.36,1)}
.ld details[open] .plus{transform:rotate(45deg)}
.ld details .ans{padding:0 24px 24px;font-size:15px;line-height:24px;color:var(--c-muted);max-width:620px}

/* cierre */
.ld .final{padding:96px 24px 0}
.ld .final-card{background:var(--c-block);border-radius:28px;padding:96px 48px;text-align:center}
.ld .final-card h2{color:var(--c-on-block);max-width:640px;margin:0 auto}
.ld .final-card p{color:var(--c-on-block-soft);font-size:18px;line-height:28px;margin:16px auto 32px;max-width:30rem}
.ld .final-fine{font-size:13px;color:var(--c-on-block-faint);margin-top:16px}

/* footer */
/* El padding de abajo le deja aire al botón flotante de WhatsApp (58px de alto
   + 24px del borde). Sin esto el FAB se come el final del "© 2026 Turnito". */
.ld footer{padding:32px 24px 96px}
.ld .foot-in{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
.ld .foot-links{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.ld .foot-in span,.ld .foot-links a,.ld .foot-links button{font-size:14px;color:var(--c-muted)}
/* "Contacto" abre un modal, así que es un button y no un link: hay que sacarle
   el fondo y el borde que le pone el navegador para que se vea igual que los otros. */
.ld .foot-links button{background:none;border:none;font-weight:400;line-height:inherit}
.ld .foot-links a:hover,.ld .foot-links button:hover{color:var(--c-ink)}

@media(max-width:1080px){
  .ld .hero-in{grid-template-columns:1fr;gap:40px}
  .ld .nav-links{display:none}
  .ld .fpanel{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ld .fcell:nth-child(3){border-left:none}
  .ld .fcell:nth-child(n+3){border-top:1px solid var(--c-line)}
  .ld .faq-grid{grid-template-columns:1fr;gap:32px}
}
@media(max-width:720px){
  .ld .hero{padding-top:40px}
  .ld .stage{height:auto;padding:16px;border-radius:24px}
  .ld .scene{display:flex;flex-direction:column;align-items:center;margin-top:16px}
  .ld .phone{position:relative;left:auto;bottom:auto;width:264px;margin-bottom:-24px}
  .ld .screen{height:auto}
  .ld .next-wrap{position:relative;right:auto;top:auto;width:100%;max-width:300px;margin-top:-64px;z-index:2}
  .ld .next-cap{display:none}
  .ld section,.ld .final{padding:64px 16px 0}
  .ld .hero,.ld footer{padding-left:16px;padding-right:16px}
  .ld nav{padding:0 16px}
  .ld .about{padding:32px 24px}
  .ld .statrow{gap:16px;margin-top:32px;padding-top:24px}
  .ld .stat b{font-size:28px}
  .ld .stat span{font-size:13px;line-height:18px}
  .ld .fpanel{grid-template-columns:1fr}
  .ld .fcell{border-left:none;padding:24px}
  .ld .fcell+.fcell{border-top:1px solid var(--c-line)}
  .ld .steps{grid-template-columns:1fr;gap:32px}
  .ld .step{padding-top:0;padding-left:48px}
  .ld .step::before{top:40px;bottom:-32px;left:16px;right:auto;width:1px;height:auto}
  .ld .final-card{padding:64px 24px;border-radius:24px}
  .ld .sec-head{flex-direction:column;align-items:flex-start;gap:16px}
}
`;

// Entrada al scrollear: un fade y 12px de subida, sin spring ni escala.
const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};
const riseGroup: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

// El ejemplo cambia de rubro: es el argumento más directo de que Turnito
// dejó de ser sólo para barberías. Lo que reserva el cliente en el teléfono
// es lo mismo que aparece en la tarjeta "Siguiente" del panel, así las dos
// mitades del ejemplo cuentan una sola historia.
const MOCKS = [
  {
    rubro: "Uñas",
    shop: "Bloom Nails",
    slug: "bloom-nails",
    svc: [
      ["Semi", "$8.500"],
      ["Kapping", "$12.000"],
      ["Soft gel", "$15.000"],
    ],
    cliente: "Martina Ruiz",
    dura: "1 h",
  },
  {
    rubro: "Barbería",
    shop: "Barbería El Toro",
    slug: "el-toro",
    svc: [
      ["Corte", "$3.500"],
      ["Barba", "$2.000"],
      ["Combo", "$5.000"],
    ],
    cliente: "Lucas Ferreyra",
    dura: "30 min",
  },
  {
    rubro: "Tatuajes",
    shop: "Tinta Negra",
    slug: "tinta-negra",
    svc: [
      ["Sesión", "A consultar"],
      ["Diseño", "$6.000"],
      ["Retoque", "$4.000"],
    ],
    cliente: "Agustina Paz",
    dura: "3 h",
  },
  {
    rubro: "Pestañas",
    shop: "Estudio Mirada",
    slug: "estudio-mirada",
    svc: [
      ["Lifting", "$9.000"],
      ["Extensiones", "$14.000"],
      ["Cejas", "$5.000"],
    ],
    cliente: "Sofía Medina",
    dura: "1 h",
  },
  {
    rubro: "Peluquería",
    shop: "Peluquería Rulos",
    slug: "rulos",
    svc: [
      ["Corte", "$4.500"],
      ["Color", "$12.000"],
      ["Brushing", "$3.000"],
    ],
    cliente: "Valentina Gómez",
    dura: "45 min",
  },
];

// Íconos de línea (trazos de lucide, ISC). Un solo tamaño y un solo trazo.
function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const IconLink = () => (
  <Icon>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
);
const IconCalendarCheck = () => (
  <Icon>
    <path d="M8 2v4" /><path d="M16 2v4" />
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M3 10h18" /><path d="m9 16 2 2 4-4" />
  </Icon>
);
const IconTicket = () => (
  <Icon>
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
  </Icon>
);
const IconUsers = () => (
  <Icon>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);
const IconPlus = () => (
  <Icon size={18}><path d="M5 12h14" /><path d="M12 5v14" /></Icon>
);
const IconCheck = () => (
  <Icon size={16}><path d="M20 6 9 17l-5-5" /></Icon>
);

const FEATURES = [
  {
    icon: <IconLink />,
    h: "Tu link propio",
    p: <><span className="mono">{SITE_DOMAIN}/tu-negocio</span>. El cliente entra, ve tus horarios libres reales y reserva en menos de un minuto. Sin registro ni contraseñas.</>,
  },
  {
    icon: <IconCalendarCheck />,
    h: "Agenda que se ordena sola",
    p: "Cada reserva cae en su lugar y el horario ocupado se bloquea al instante para todos los demás.",
  },
  {
    icon: <IconTicket />,
    h: "Comprobante al instante",
    p: "Apenas reserva, tu cliente recibe un link propio con los datos del turno para verlo o cancelarlo cuando quiera.",
  },
  {
    icon: <IconUsers />,
    h: "Varias agendas a la vez",
    p: "Si son más de uno, cada persona del equipo tiene su propia agenda y su propio horario libre.",
  },
];

const STEPS = [
  ["Configurá tu negocio", "Elegís a qué te dedicás y te precargamos los servicios típicos de tu rubro. Ajustás precios y horarios una sola vez."],
  ["Compartí tu link", <>Te damos tu dirección propia: <span className="mono">{SITE_DOMAIN}/tu-negocio</span>. La ponés donde ya hablás con tus clientes.</>],
  ["Atendé con la agenda abierta", "Tu panel te muestra quién sigue, qué pidió y a qué hora. Un botón para el siguiente y eso es todo."],
] as const;

const FAQS = [
  ["¿Sirve si no tengo una barbería?", "Sí — Turnito es para cualquier negocio que trabaje con turnos: uñas, pestañas y cejas, tatuajes, peluquería, barbería. Al crear tu cuenta elegís a qué te dedicás y la app se acomoda: te precarga los servicios típicos de tu rubro y habla tu idioma."],
  ["¿Mis clientes tienen que crearse una cuenta?", "No. Reservan con su nombre y su teléfono, y al confirmar reciben un link propio para ver o cancelar su turno. Cero contraseñas."],
  ["Mis sesiones duran varias horas, ¿entra?", "Sí. Un servicio puede durar desde 15 minutos hasta 8 horas, así que una sesión larga de tatuaje ocupa el bloque completo y nadie te puede reservar encima."],
  ["¿Y si no tengo un precio fijo?", "Podés dejar un servicio en \"a consultar\" en vez de poner un número. El cliente reserva igual y el precio lo arreglan entre ustedes."],
  ["¿Qué pasa si un cliente cancela?", "El horario se libera automáticamente y vuelve a estar disponible para cualquier otra persona. Vos lo ves reflejado en tu agenda al instante."],
  ["¿Sirve si trabajo sola?", "Sí, y es el caso más simple: una agenda, tus horarios, tu link. Si algún día sumás gente, cargás al equipo y cada uno pasa a tener su propia agenda sin que tengas que rehacer nada."],
  ["¿Necesito saber de tecnología?", "Si sabés usar WhatsApp, sabés usar Turnito. La configuración son cuatro pantallas guiadas y el uso diario es una sola: la agenda del día."],
  ["¿Cómo se paga? ¿Hay permanencia?", "Por Mercado Pago, mes a mes. Sin contrato: si un mes no lo querés pagar, se pausa y tus datos quedan guardados."],
];

const swap = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.3, ease: EASE },
};

export default function LandingPage() {
  const [mock, setMock] = useState(0);
  // El ejemplo rota solo hasta que el visitante elige un rubro. Desde ahí
  // manda él: que le cambie la pantalla mientras la está mirando molesta.
  const [rotando, setRotando] = useState(true);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    if (!rotando) return;
    const id = setInterval(() => setMock((m) => (m + 1) % MOCKS.length), 4000);
    return () => clearInterval(id);
  }, [rotando]);

  // Estable entre renders. El intervalo de acá arriba re-renderiza la landing
  // cada 4 segundos: si esto fuera una arrow suelta, cada rotación le pasaría
  // una función nueva al modal. ContactModal ya no se rompe por eso, pero no
  // tiene sentido hacerlo trabajar de más.
  const cerrarContacto = useCallback(() => setContactOpen(false), []);

  const m = MOCKS[mock];

  return (
    <>
    <div className="ld">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* NAV */}
      <nav>
        <div className="nav-in wrap">
          <Link className="logo" href="#"><LogoMark size={24} /> turnito</Link>
          <div className="nav-links">
            <a href="#rubros">Para quién es</a>
            <a href="#features">Qué incluye</a>
            <a href="#como">Cómo funciona</a>
            <a href="#faq">Preguntas</a>
          </div>
          <div className="nav-r">
            <ThemeToggle />
            <Link className="btn btn-primary btn-sm" href="/login">Probar gratis</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="hero">
        <div className="hero-in wrap">
          <div>
            {/* El titular entra palabra por palabra: es la única entrada de la
                página al cargar. "solos" va en azul porque es la promesa
                entera del producto. */}
            <SplitText
              as="h1"
              className="display"
              delay={0.1}
              stagger={0.07}
              highlight="solos"
              highlightClassName="b"
            >
              Tus turnos, solos
            </SplitText>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.35 }}
            >
              <p className="hero-sub">
                Barbería, uñas, pestañas, tatuajes o peluquería: tus clientes reservan
                desde un link, sin crearse cuentas ni descargar nada. Vos abrís el panel
                y sabés exactamente quién sigue.
              </p>
              <div className="hero-ctas">
                <Link className="btn btn-primary" href="/login">Probar 30 días gratis</Link>
                <a className="btn btn-ghost" href="#como">Ver cómo funciona</a>
              </div>
              <p className="hero-fine">Sin tarjeta y sin permanencia</p>
            </motion.div>
          </div>

          {/* Escenario: a la izquierda reserva el cliente, a la derecha lo ves vos */}
          <motion.div
            id="rubros"
            className="stage"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
          >
            <div className="tabs" role="group" aria-label="Ver el ejemplo de un negocio de">
              {MOCKS.map((x, i) => (
                <button
                  key={x.rubro}
                  type="button"
                  className="tab"
                  aria-pressed={i === mock}
                  onClick={() => { setMock(i); setRotando(false); }}
                >
                  {x.rubro}
                </button>
              ))}
            </div>

            <div className="scene">
              <div className="phone" aria-label={`Pantalla de reserva de ${m.shop}`} role="img">
                <div className="notch" />
                <div className="screen">
                  <AnimatePresence mode="wait">
                    <motion.div key={m.shop} {...swap}>
                      <div className="scr-shop">{m.shop}</div>
                      <div className="scr-sub">{SITE_DOMAIN}/{m.slug}</div>
                      <div className="scr-label">Servicio</div>
                      <div className="chiprow">
                        {m.svc.map(([n, p], i) => (
                          <div className={`chip${i === 0 ? " on" : ""}`} key={n}>
                            <b>{n}</b><span>{p}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  <div className="scr-label">Día</div>
                  <div className="dayrow">
                    <div className="day on"><em>Hoy</em><b>16</b></div>
                    <div className="day"><em>Vie</em><b>17</b></div>
                    <div className="day"><em>Sáb</em><b>18</b></div>
                    <div className="day"><em>Mar</em><b>21</b></div>
                    <div className="day"><em>Mié</em><b>22</b></div>
                  </div>
                  <div className="scr-label">Horario</div>
                  <div className="slotgrid">
                    <div className="slot off">09:00</div><div className="slot">09:45</div>
                    <div className="slot">10:30</div><div className="slot off">11:15</div>
                    <div className="slot">12:00</div><div className="slot on">14:15</div>
                    <div className="slot">15:00</div><div className="slot">15:45</div>
                  </div>
                  <div className="scr-btn">Confirmar turno</div>
                </div>
              </div>

              <div className="next-wrap">
                <p className="next-cap">En tu panel, al instante</p>
                <div className="next" role="img" aria-label={`Tarjeta del panel: sigue ${m.cliente} a las 14:15`}>
                  <div className="next-top">Siguiente <span>Hoy</span></div>
                  <AnimatePresence mode="wait">
                    <motion.div key={m.shop} className="next-row" {...swap}>
                      <div className="next-time">14:15</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="next-name">{m.cliente}</div>
                        <div className="next-svc">{m.svc[0][0]} · {m.dura}</div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                  <div className="next-btn"><IconCheck /> Listo, siguiente</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      {/* QUÉ ES */}
      <section>
        <div className="wrap">
          {/* amount bajo: el borde de esta tarjeta asoma en el primer pantallazo
              y tiene que estar ahí, no aparecer recién al scrollear. */}
          <Reveal variants={rise} amount={0.1}>
            <div className="about">
              <div className="label">Qué es Turnito</div>
              <p className="lead">
                <b>Una agenda que trabaja sola.</b> Sin planillas, sin cadenas de WhatsApp
                a las once de la noche, sin turnos anotados en un papel que después
                nadie encuentra.
              </p>
              <div className="statrow">
                {[
                  ["15 min", "de configuración, una sola vez"],
                  ["0", "apps que baja tu cliente"],
                  ["24/7", "la agenda nunca cierra"],
                ].map(([b, s]) => (
                  <div className="stat" key={b}><b>{b}</b><span>{s}</span></div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* QUÉ INCLUYE */}
      <section id="features">
        <div className="wrap">
          <Reveal variants={rise} className="sec-head">
            <div>
              <div className="label">Qué incluye</div>
              <h2>Lo que hace Turnito mientras vos atendés</h2>
            </div>
            <p>Una sola herramienta con un solo trabajo: que tu agenda se llene sola.</p>
          </Reveal>
          <RevealGroup className="fpanel" variants={riseGroup}>
            {FEATURES.map((f) => (
              <Item key={f.h} variants={rise} className="fcell">
                <div className="ficon">{f.icon}</div>
                <h3>{f.h}</h3>
                <p>{f.p}</p>
              </Item>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como">
        <div className="wrap">
          <Reveal variants={rise} className="sec-head">
            <div>
              <div className="label">Cómo funciona</div>
              <h2>De cero a recibir turnos en tres pasos</h2>
            </div>
          </Reveal>
          <RevealGroup className="steps" variants={riseGroup}>
            {STEPS.map(([h, p], i) => (
              <Item key={h} variants={rise} className="step">
                <div className="step-n">{i + 1}</div>
                <h3>{h}</h3>
                <p>{p}</p>
              </Item>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq">
        <div className="wrap faq-grid">
          <Reveal variants={rise}>
            <div className="label">Preguntas</div>
            <h2>Antes de arrancar</h2>
          </Reveal>
          <RevealGroup className="faq" variants={riseGroup}>
            {FAQS.map(([q, a]) => (
              <Item key={q} variants={rise}>
                <details>
                  <summary>{q} <span className="plus"><IconPlus /></span></summary>
                  <div className="ans">{a}</div>
                </details>
              </Item>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* CIERRE */}
      <div className="final">
        <Reveal variants={rise} className="wrap">
          <div className="final-card">
            <h2>Tu próximo turno se reserva solo</h2>
            <p>Configurá tu negocio hoy y probalo con tus clientes reales.</p>
            <Link className="btn btn-on-block" href="/login">Probar 30 días gratis</Link>
            <div className="final-fine">Sin tarjeta y sin permanencia</div>
          </div>
        </Reveal>
      </div>

      {/* FOOTER */}
      <footer>
        <div className="foot-in wrap">
          <Link className="logo" href="#" style={{ fontSize: 16 }}><LogoMark size={20} /> turnito</Link>
          <div className="foot-links">
            <button type="button" onClick={() => setContactOpen(true)}>Contacto</button>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <Link href="/legales">Términos y Privacidad</Link>
          </div>
          <span>© 2026 Turnito · Córdoba, Argentina</span>
        </div>
      </footer>
    </div>

    {/* Fuera del .ld: ese scope tiene un `* { margin:0; padding:0 }` que le
        gana por especificidad a las utilidades de Tailwind del modal. */}
    <ContactModal open={contactOpen} onClose={cerrarContacto} />
    <WhatsAppFab />
    </>
  );
}
