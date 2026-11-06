"use client";

// components/motion.tsx
// Kit de animación de Turnito. Importá desde acá en todas las vistas.

import {
  motion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import { useRef, type ReactNode } from "react";

// ── EASINGS ──────────────────────────────────────────────
export const EASE = [0.22, 1, 0.36, 1] as const; // easeOutExpo-ish
export const SPRING = { type: "spring", stiffness: 260, damping: 24 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 140, damping: 20 } as const;

// ── VARIANTS BASE ────────────────────────────────────────
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: SPRING },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: 40 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } },
};

// Contenedor que escalona a sus hijos
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

export const staggerFast: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};

// ── PAGE WRAPPER (transición de entrada de cada página) ──
export function PageTransition({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── REVEAL AL HACER SCROLL (una vez) ─────────────────────
export function Reveal({
  children,
  variants = fadeUp,
  className = "",
  amount = 0.3,
}: {
  children: ReactNode;
  variants?: Variants;
  className?: string;
  amount?: number;
}) {
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── GRUPO CON STAGGER AL SCROLL ──────────────────────────
export function RevealGroup({
  children,
  className = "",
  variants = stagger,
  amount = 0.2,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  amount?: number;
  as?: "div" | "ul" | "ol";
}) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      className={className}
    >
      {children}
    </MotionTag>
  );
}

// Item para usar dentro de RevealGroup / stagger
export function Item({
  children,
  variants = fadeUp,
  className = "",
}: {
  children: ReactNode;
  variants?: Variants;
  className?: string;
}) {
  return (
    <motion.div variants={variants} className={className}>
      {children}
    </motion.div>
  );
}

// ── TEXTO QUE ENTRA POR PARTES ───────────────────────────
//
// El efecto "split text": el titular no aparece de una, se arma palabra por
// palabra (o letra por letra) en cascada.
//
// POR QUÉ ESTÁ ESCRITO ACÁ Y NO INSTALADO
//
// El componente de React Bits que hace esto arrastra `gsap` + `@gsap/react` +
// dos plugins: unos 70 KB para una app que los dueños abren desde el celular,
// muchas veces con datos. Y sería una SEGUNDA librería de animación al lado de
// framer-motion, que ya está acá y ya anima todas las pantallas. El efecto es
// un stagger sobre hijos, que es justamente lo que framer hace nativo: no
// justifica la dependencia.
//
// ACCESIBILIDAD, QUE ES LO QUE SUELE ROMPERSE AL PARTIR TEXTO
//
// Partir una frase en <span> la convierte, para un lector de pantalla, en una
// ristra de fragmentos sueltos. Por eso el contenedor lleva el texto completo
// en `aria-label` y los pedazos van `aria-hidden`: en pantalla se anima por
// partes, al oído se lee como una sola frase.
//
// El movimiento lo apaga solo el `MotionConfig reducedMotion="user"` de
// app/template.tsx: framer desactiva `y` y `filter` y deja la opacidad, así que
// quien pidió menos movimiento ve el texto aparecer sin desplazamiento.

type SplitTextProps = {
  children: string;
  /** "word" (default) para titulares; "char" sólo para frases muy cortas. */
  by?: "word" | "char";
  /** Segundos entre una parte y la siguiente. */
  stagger?: number;
  /** Espera antes de arrancar. */
  delay?: number;
  /** Dispara al entrar en viewport en vez de al montar. */
  onScroll?: boolean;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  /**
   * Cola del texto que va con otro estilo, tal cual aparece al final de
   * `children` — por ejemplo "solos." en "Tus turnos, solos.". Se le aplica
   * `highlightClassName` sin romper la cascada: sigue siendo el mismo stagger,
   * sólo cambian de color las últimas palabras.
   */
  highlight?: string;
  highlightClassName?: string;
};

const splitPiece: Variants = {
  // El blur es lo que separa esto de un fade cualquiera: el texto "enfoca"
  // al entrar. Cuesta nada y es la mitad del efecto.
  hidden: { opacity: 0, y: "0.4em", filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: "0em",
    filter: "blur(0px)",
    transition: { duration: 0.55, ease: EASE },
  },
};

export function SplitText({
  children,
  by = "word",
  stagger: step = 0.055,
  delay = 0,
  onScroll = false,
  className = "",
  as = "span",
  highlight,
  highlightClassName = "",
}: SplitTextProps) {
  const MotionTag = motion[as];
  // Por palabras conservamos el espacio real entre ellas: sin eso el titular
  // se lee todojunto cuando las animaciones están apagadas.
  const partes = by === "word" ? children.split(" ") : Array.from(children);

  // Desde qué parte empieza la cola resaltada. -1 = no hay resaltado.
  const desdeResaltado =
    highlight && children.endsWith(highlight)
      ? partes.length - (by === "word" ? highlight.split(" ").length : highlight.length)
      : -1;

  const contenedor: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: step, delayChildren: delay } },
  };

  const anim = onScroll
    ? { whileInView: "show" as const, viewport: { once: true, amount: 0.5 } }
    : { animate: "show" as const };

  return (
    <MotionTag
      className={className}
      variants={contenedor}
      initial="hidden"
      {...anim}
      aria-label={children}
    >
      {partes.map((parte, i) => (
        <motion.span
          key={`${parte}-${i}`}
          variants={splitPiece}
          aria-hidden="true"
          className={desdeResaltado >= 0 && i >= desdeResaltado ? highlightClassName : undefined}
          // inline-block es obligatorio: un <span> inline ignora `y`.
          style={{ display: "inline-block", whiteSpace: "pre" }}
        >
          {parte}
          {by === "word" && i < partes.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </MotionTag>
  );
}

// ── PARALLAX (mueve el hijo según el scroll) ─────────────
export function Parallax({
  children,
  offset = 60,
  className = "",
}: {
  children: ReactNode;
  offset?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}

// Re-export para comodidad
export { motion };
