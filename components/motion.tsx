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
