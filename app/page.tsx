"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import ContactModal from "@/components/ContactModal";
import ThemeToggle from "@/components/ThemeToggle";
import { SITE_DOMAIN } from "@/lib/site";
import { WHATSAPP_URL } from "@/lib/contacto";
import { AnimatePresence } from "framer-motion";
import {
  motion,
  Reveal,
  RevealGroup,
  Item,
  fadeUp,
  scaleIn,
  stagger,
  staggerFast,
  EASE,
} from "@/components/motion";

const css = `
.ld{box-sizing:border-box;background:var(--c-canvas);color:var(--c-body);font-family:var(--font-urbanist),sans-serif;font-size:16px;line-height:1.6}
.ld *{box-sizing:border-box;margin:0;padding:0}
.ld h1,.ld h2,.ld h3{color:var(--c-ink);letter-spacing:-0.035em;line-height:1.03}
.ld ::selection{background:var(--c-highlight);color:var(--c-on-highlight)}
.ld a{text-decoration:none}

/* punto de color después del heading — firma del sistema */
.ld .dot::after{content:'';display:inline-block;width:.3em;height:.3em;border-radius:50%;background:var(--c-highlight);margin-left:.12em}
.ld .dot-b::after{background:var(--c-accent)}

/* NAV */
.ld nav{position:sticky;top:14px;z-index:100;padding:0 20px}
.ld .nav-in{max-width:1200px;margin:0 auto;background:color-mix(in srgb, var(--c-surface) 88%, transparent);backdrop-filter:blur(16px);border:1px solid var(--c-line);border-radius:100px;padding:11px 11px 11px 24px;display:flex;align-items:center;justify-content:space-between}
.ld .logo{font-weight:800;font-size:19px;letter-spacing:-0.04em;display:flex;align-items:center;gap:9px;color:var(--c-ink)}
.ld .nav-links{display:flex;gap:30px;font-size:14.5px;font-weight:500}
.ld .nav-links a{color:var(--c-muted);transition:color .15s}
.ld .nav-links a:hover{color:var(--c-accent)}
.ld .pill{display:inline-flex;align-items:center;gap:8px;background:var(--c-accent);color:var(--c-on-accent);font-size:14.5px;font-weight:600;padding:12px 24px;border-radius:100px;transition:background .15s}
.ld .pill:hover{background:var(--c-accent-hover)}
.ld .pill.lime{background:var(--c-highlight);color:var(--c-on-highlight)}
.ld .pill.lime:hover{background:var(--c-highlight-hover)}
.ld .pill.ghost{background:var(--c-surface);color:var(--c-ink);border:1px solid var(--c-line)}

/* HERO */
.ld .hero{padding:44px 20px 0}
.ld .hero-in{max-width:1200px;margin:0 auto}
.ld .eyebrow{display:inline-flex;align-items:center;gap:9px;background:var(--c-surface);border:1px solid var(--c-line);border-radius:100px;padding:7px 16px 7px 8px;font-size:13px;font-weight:500;color:var(--c-muted);margin-bottom:26px}
.ld .eyebrow b{background:var(--c-highlight);color:var(--c-on-highlight);font-weight:700;font-size:11.5px;padding:4px 11px;border-radius:100px}
.ld .display{font-size:clamp(52px,10.5vw,148px);font-weight:800;letter-spacing:-0.05em;line-height:.92}
.ld .display .b{color:var(--c-accent)}
.ld .hero-sub{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;flex-wrap:wrap;margin:26px 0 32px}
.ld .hero-sub p{font-size:17.5px;color:var(--c-muted);max-width:430px}
.ld .hero-ctas{display:flex;gap:12px;flex-wrap:wrap}

/* bloque azul del hero */
.ld .stage{background:var(--c-block);border-radius:40px;padding:52px 48px 0;display:grid;grid-template-columns:1fr auto 1fr;gap:32px;align-items:end;min-height:520px;position:relative;overflow:hidden}
.ld .stage-l{padding-bottom:52px}
.ld .stage-r{padding-bottom:52px;display:flex;flex-direction:column;align-items:flex-end;gap:14px}
.ld .qcard{background:var(--c-block-card);border-radius:24px;padding:22px 24px;max-width:260px}
.ld .qcard h4{font-size:15px;font-weight:700;color:var(--c-block-card-ink);margin-bottom:6px}
.ld .qcard p{font-size:13.5px;color:var(--c-block-card-muted);line-height:1.55}
.ld .qcard.lime{background:var(--c-highlight)}
.ld .qcard.lime h4{color:var(--c-on-highlight)}
.ld .qcard.lime p{color:rgba(0,0,0,.68)}
.ld .stat-b{color:var(--c-on-block)}
.ld .stat-b b{display:block;font-size:44px;font-weight:800;letter-spacing:-0.04em;line-height:1}
.ld .stat-b span{font-size:13px;color:var(--c-on-block-soft)}

/* teléfono */
.ld .phone{width:296px;background:var(--c-block-card);border-radius:42px;padding:12px;box-shadow:0 30px 70px rgba(0,0,0,.28);position:relative;z-index:2}
.ld .notch{width:104px;height:24px;background:#0A0A0A;border-radius:100px;margin:2px auto 10px}
.ld .screen{background:var(--c-canvas);border-radius:32px;padding:18px 16px 22px;min-height:432px}
.ld .scr-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px}
.ld .scr-shop{font-weight:800;font-size:15.5px;color:var(--c-ink);letter-spacing:-0.02em}
.ld .scr-sub{font-size:10px;color:var(--c-faint);margin-top:1px;font-family:var(--font-mono),monospace}
.ld .scr-badge{background:var(--c-highlight);color:var(--c-on-highlight);font-size:9px;font-weight:800;padding:4px 9px;border-radius:100px;letter-spacing:.05em;white-space:nowrap}
.ld .scr-label{font-size:9.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--c-faint);margin:14px 0 8px}
.ld .chiprow{display:flex;gap:6px}
.ld .chip{flex:1;background:var(--c-surface);border:1.5px solid var(--c-line);border-radius:15px;padding:10px 5px;text-align:center}
.ld .chip.on{border-color:var(--c-accent);background:var(--c-accent-soft)}
.ld .chip b{display:block;font-size:10.5px;color:var(--c-ink);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ld .chip span{font-size:9.5px;color:var(--c-accent);font-weight:700}
.ld .dayrow{display:flex;gap:5px}
.ld .day{flex:1;background:var(--c-surface);border:1.5px solid var(--c-line);border-radius:13px;padding:7px 2px;text-align:center}
.ld .day.on{border-color:var(--c-accent);background:var(--c-accent-soft)}
.ld .day em{display:block;font-style:normal;font-size:8px;color:var(--c-faint);text-transform:uppercase;font-weight:600}
.ld .day b{font-size:13px;color:var(--c-ink)}
.ld .day.on em,.ld .day.on b{color:var(--c-accent)}
.ld .slotgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.ld .slot{background:var(--c-surface);border:1.5px solid var(--c-line);border-radius:11px;padding:7px 2px;text-align:center;font-size:10px;font-weight:700;color:var(--c-body)}
.ld .slot.on{background:var(--c-accent);border-color:var(--c-accent);color:var(--c-on-accent)}
.ld .slot.off{opacity:.36;text-decoration:line-through;border-style:dashed}
.ld .scr-btn{margin-top:15px;background:var(--c-accent);color:var(--c-on-accent);border-radius:100px;padding:12px;text-align:center;font-size:12px;font-weight:700}

/* RUBROS */
.ld .rubros{max-width:1200px;margin:0 auto;padding:22px 0 0;display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.ld .rub{display:inline-flex;align-items:center;gap:9px;background:var(--c-surface);border:1px solid var(--c-line);border-radius:100px;padding:11px 20px;font-size:14.5px;font-weight:600;color:var(--c-ink)}
.ld .rub span{font-size:17px;line-height:1}

/* SECCIONES */
.ld section{padding:96px 20px}
.ld .wrap{max-width:1200px;margin:0 auto}
.ld .kicker{display:inline-flex;align-items:center;gap:9px;font-size:12.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--c-muted);margin-bottom:18px}
.ld .kicker::before{content:'';width:24px;height:2px;background:var(--c-accent);border-radius:2px}
.ld h2{font-size:clamp(34px,4.6vw,58px);font-weight:800;max-width:640px}
.ld .sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:36px;flex-wrap:wrap;margin-bottom:44px}
.ld .sec-head p{max-width:350px;color:var(--c-muted);font-size:15.5px}

/* bloque "sobre" — tarjeta blanca grande */
.ld .about{background:var(--c-surface);border-radius:40px;padding:64px 56px}
.ld .about .lead{font-size:clamp(26px,3.4vw,42px);font-weight:700;letter-spacing:-0.035em;line-height:1.16;color:var(--c-ink);max-width:900px}
.ld .about .lead i{font-style:normal;color:var(--c-accent)}
.ld .statrow{display:flex;gap:56px;flex-wrap:wrap;margin-top:44px;padding-top:36px;border-top:1px solid var(--c-line)}
.ld .stat b{display:block;font-size:clamp(36px,4.4vw,52px);font-weight:800;color:var(--c-accent);letter-spacing:-0.04em;line-height:1}
.ld .stat span{font-size:13.5px;color:var(--c-muted)}

/* features — bloque azul con tarjetas numeradas */
.ld .feat-wrap{background:var(--c-block);border-radius:40px;padding:64px 56px}
.ld .feat-wrap h2,.ld .feat-wrap .kicker{color:var(--c-on-block)}
.ld .feat-wrap .kicker::before{background:var(--c-highlight)}
.ld .feat-wrap .sec-head p{color:var(--c-on-block-soft)}
.ld .fgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.ld .fcard{background:var(--c-block-card);border-radius:26px;padding:26px 24px;height:100%;display:flex;flex-direction:column}
.ld .fcard .n{font-size:46px;font-weight:800;color:var(--c-accent);letter-spacing:-0.05em;line-height:1;margin-bottom:auto;padding-bottom:26px}
.ld .fcard h3{font-size:17px;font-weight:700;margin-bottom:8px}
.ld .fcard p{font-size:13.5px;color:var(--c-block-card-muted);line-height:1.6}
.ld .fcard.lime{background:var(--c-highlight)}
.ld .fcard.lime .n{color:var(--c-on-highlight)}
.ld .fcard.lime h3{color:var(--c-on-highlight)}
.ld .fcard.lime p{color:rgba(0,0,0,.7)}

/* pasos */
.ld .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.ld .step{background:var(--c-surface);border-radius:26px;padding:34px 30px;position:relative;height:100%}
.ld .step .badge{display:inline-block;background:var(--c-block);color:var(--c-on-block);font-weight:800;font-size:12.5px;padding:5px 14px;border-radius:100px;margin-bottom:16px}
.ld .step h3{font-size:18px;font-weight:700;margin-bottom:9px}
.ld .step p{font-size:14px;color:var(--c-muted);line-height:1.65}
.ld .step .mono{font-family:var(--font-mono),monospace;color:var(--c-accent);font-size:13px;font-weight:600}

/* faq */
.ld .faq{max-width:790px;margin:0 auto}
.ld details{background:var(--c-surface);border-radius:22px;margin-bottom:10px;overflow:hidden}
.ld summary{padding:23px 27px;cursor:pointer;font-size:16.5px;font-weight:700;color:var(--c-ink);list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px}
.ld summary::-webkit-details-marker{display:none}
.ld .plus{width:31px;height:31px;border-radius:50%;background:var(--c-canvas);color:var(--c-accent);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;flex-shrink:0;transition:transform .2s,background .2s,color .2s}
.ld details[open] .plus{transform:rotate(45deg);background:var(--c-block);color:var(--c-on-block)}
.ld details .ans{padding:0 27px 25px;font-size:14.5px;color:var(--c-muted);line-height:1.7;max-width:620px}

/* cta final */
.ld .final{padding:0 20px 20px}
.ld .final-card{max-width:1200px;margin:0 auto;background:var(--c-block);border-radius:40px;padding:80px 48px 0;text-align:center;overflow:hidden}
.ld .final-card h2{color:var(--c-on-block);max-width:680px;margin:0 auto 16px;font-size:clamp(34px,4.6vw,56px)}
.ld .final-card>p{color:var(--c-on-block-soft);font-size:16.5px;margin-bottom:30px}
.ld .final-fine{font-size:13px;color:var(--c-on-block-faint);margin-top:16px}
.ld .wordmark{font-size:clamp(64px,17vw,240px);font-weight:800;letter-spacing:-0.055em;color:var(--c-on-block);line-height:.82;margin-top:44px;user-select:none}

/* footer */
.ld footer{padding:26px 20px 34px}
.ld .foot-in{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
.ld .foot-links{display:flex;gap:26px;align-items:center;flex-wrap:wrap}
.ld .foot-in span,.ld .foot-links a,.ld .foot-links button{font-size:13.5px;color:var(--c-muted)}
/* "Contacto" abre un modal, así que es un button y no un link: hay que sacarle
   el fondo y el borde que le pone el navegador para que se vea igual que los otros. */
.ld .foot-links button{background:none;border:none;font-family:inherit;font-weight:400;cursor:pointer;line-height:inherit}
.ld .foot-links a:hover,.ld .foot-links button:hover{color:var(--c-accent)}
.ld .foot-links a:focus-visible,.ld .foot-links button:focus-visible{outline:2px solid var(--c-accent);outline-offset:3px;border-radius:3px}

@media(max-width:1000px){
  .ld .stage{grid-template-columns:1fr;padding:40px 26px 0;gap:24px}
  .ld .stage-l,.ld .stage-r{padding-bottom:0;align-items:flex-start}
  .ld .stage-r{padding-bottom:40px}
  .ld .phone{margin:0 auto}
  .ld .fgrid{grid-template-columns:repeat(2,1fr)}
  .ld .steps{grid-template-columns:1fr}
  .ld .nav-links{display:none}
  .ld .about,.ld .feat-wrap{padding:44px 26px}
  .ld .sec-head{flex-direction:column;align-items:flex-start}
  .ld .statrow{gap:30px}
}
@media(max-width:560px){
  .ld .fgrid{grid-template-columns:1fr}
  .ld section{padding:64px 20px}
}
`;

const hover = { whileHover: { scale: 1.03 }, whileTap: { scale: 0.97 } };
const cardHover = { whileHover: { y: -6, transition: { duration: 0.2 } } };

// El mockup rota entre rubros: es el argumento más directo de que Turnito
// dejó de ser sólo para barberías.
const MOCKS = [
  {
    tag: "UÑAS",
    shop: "Bloom Nails",
    slug: "bloom-nails",
    svc: [
      ["Semi", "$8.500"],
      ["Kapping", "$12.000"],
      ["Soft gel", "$15.000"],
    ],
  },
  {
    tag: "BARBERÍA",
    shop: "Barbería El Toro",
    slug: "el-toro",
    svc: [
      ["Corte", "$3.500"],
      ["Barba", "$2.000"],
      ["Combo", "$5.000"],
    ],
  },
  {
    tag: "TATUAJES",
    shop: "Tinta Negra",
    slug: "tinta-negra",
    svc: [
      ["Sesión", "A consultar"],
      ["Diseño", "$6.000"],
      ["Retoque", "$4.000"],
    ],
  },
  {
    tag: "PESTAÑAS",
    shop: "Estudio Mirada",
    slug: "estudio-mirada",
    svc: [
      ["Lifting", "$9.000"],
      ["Extensiones", "$14.000"],
      ["Cejas", "$5.000"],
    ],
  },
];

const RUBROS_PILLS = [
  ["💈", "Barberías"],
  ["💅", "Uñas"],
  ["👁️", "Pestañas y cejas"],
  ["🖋️", "Tatuajes"],
  ["✂️", "Peluquerías"],
];

export default function LandingPage() {
  const [mock, setMock] = useState(0);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setMock((m) => (m + 1) % MOCKS.length), 3400);
    return () => clearInterval(id);
  }, []);

  const m = MOCKS[mock];

  return (
    <>
    <div className="ld">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* NAV */}
      <motion.nav
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <div className="nav-in">
          <Link className="logo" href="#"><LogoMark size={26} /> turnito</Link>
          <div className="nav-links">
            <a href="#rubros">Para quién es</a>
            <a href="#features">Qué incluye</a>
            <a href="#como">Cómo funciona</a>
            <a href="#faq">Preguntas</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ThemeToggle />
            <motion.div {...hover}>
              <Link className="pill" href="/login">Empezar gratis</Link>
            </motion.div>
          </div>
        </div>
      </motion.nav>

      {/* HERO */}
      <header className="hero">
        <div className="hero-in">
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.div className="eyebrow" variants={fadeUp}>
              <b>30 días gratis</b> Sin tarjeta, sin permanencia
            </motion.div>
            <motion.h1 className="display" variants={fadeUp}>
              Tus turnos, <span className="b">solos.</span>
            </motion.h1>
            <motion.div className="hero-sub" variants={fadeUp}>
              <p>
                Barbería, uñas, pestañas, tatuajes o peluquería: tus clientes reservan
                desde un link, sin crearse cuentas ni descargar nada. Vos abrís el panel
                y sabés exactamente quién sigue.
              </p>
              <div className="hero-ctas">
                <motion.div {...hover}>
                  <Link className="pill" href="/login">Probar 30 días gratis <span>→</span></Link>
                </motion.div>
                <motion.div {...hover}>
                  <a className="pill ghost" href="#como">Ver cómo funciona ↓</a>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>

          {/* bloque azul con el teléfono */}
          <motion.div
            className="stage"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
          >
            <div className="stage-l">
              <div className="qcard">
                <h4>Tu link propio</h4>
                <p>Lo ponés en el bio de Instagram o lo mandás por WhatsApp. Eso es toda la instalación.</p>
              </div>
            </div>

            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="phone">
                <div className="notch" />
                <div className="screen">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={m.shop}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.32, ease: EASE }}
                    >
                      <div className="scr-head">
                        <div>
                          <div className="scr-shop">{m.shop}</div>
                          <div className="scr-sub">{SITE_DOMAIN}/{m.slug}</div>
                        </div>
                        <div className="scr-badge">{m.tag}</div>
                      </div>
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
                  <div className="scr-btn">Confirmar turno →</div>
                </div>
              </div>
            </motion.div>

            <div className="stage-r">
              <div className="qcard lime">
                <h4>Se agenda solo</h4>
                <p>El horario se bloquea al instante para todos los demás. Vos no tocás nada.</p>
              </div>
              <div className="stat-b" style={{ textAlign: "right" }}>
                <b>24/7</b><span>reservas abiertas</span>
              </div>
            </div>
          </motion.div>

          {/* rubros */}
          <div id="rubros">
            <RevealGroup className="rubros" variants={staggerFast}>
              {RUBROS_PILLS.map(([e, t]) => (
                <Item key={t} variants={fadeUp}>
                  <div className="rub"><span>{e}</span>{t}</div>
                </Item>
              ))}
            </RevealGroup>
          </div>
        </div>
      </header>

      {/* SOBRE */}
      <section>
        <div className="wrap">
          <Reveal variants={scaleIn}>
            <div className="about">
              <div className="kicker">Qué es Turnito</div>
              <p className="lead">
                Una agenda que <i>trabaja sola</i>. Sin planillas, sin cadenas de WhatsApp
                a las once de la noche, sin turnos <i>anotados en un papel</i> que después
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

      {/* FEATURES */}
      <section id="features" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal variants={scaleIn}>
            <div className="feat-wrap">
              <div className="sec-head">
                <div>
                  <div className="kicker">Qué incluye</div>
                  <h2 className="dot">Todo lo que necesitás. Nada que te sobre</h2>
                </div>
                <p>Una sola herramienta con un solo trabajo: que tu agenda se llene sola y vos sólo tengas que atender.</p>
              </div>
              <RevealGroup className="fgrid">
                {[
                  ["01.", "Tu link propio", `${SITE_DOMAIN}/tu-negocio. El cliente entra, ve tus horarios libres reales y reserva en menos de un minuto. Sin registro ni contraseñas.`, false],
                  ["02.", "Agenda que se ordena sola", "Cada reserva cae en su lugar y el horario ocupado se bloquea al instante para todos los demás.", true],
                  ["03.", "Comprobante al instante", "Apenas reserva, tu cliente recibe un link propio con los datos del turno para verlo o cancelarlo cuando quiera.", false],
                  ["04.", "Varias agendas a la vez", "Si son más de uno, cada persona del equipo tiene su propia agenda y su propio horario libre.", false],
                ].map(([n, h, p, lime]) => (
                  <Item key={n as string} variants={scaleIn}>
                    <motion.div className={`fcard${lime ? " lime" : ""}`} {...cardHover}>
                      <div className="n">{n}</div>
                      <h3>{h}</h3>
                      <p>{p}</p>
                    </motion.div>
                  </Item>
                ))}
              </RevealGroup>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head">
            <Reveal>
              <div className="kicker">Cómo funciona</div>
              <h2 className="dot dot-b">De cero a recibir turnos en tres pasos</h2>
            </Reveal>
          </div>
          <RevealGroup className="steps">
            {[
              ["01", "Configurá tu negocio", <>Elegís a qué te dedicás y te precargamos los servicios típicos de tu rubro. Ajustás precios y horarios: <span className="mono">~15 minutos</span>, una sola vez.</>],
              ["02", "Compartí tu link", <>Te damos tu dirección propia: <span className="mono">{SITE_DOMAIN}/tu-negocio</span>. La ponés donde ya hablás con tus clientes.</>],
              ["03", "Atendé con la agenda abierta", <>Tu panel te muestra quién sigue, qué pidió y a qué hora. Un botón para el siguiente. <span className="mono">Eso es todo.</span></>],
            ].map(([n, h, p], i) => (
              <Item key={i as number} variants={fadeUp}>
                <div className="step">
                  <div className="badge">{n}</div>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              </Item>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head" style={{ marginBottom: 34 }}>
            <Reveal>
              <div className="kicker">Preguntas</div>
              <h2 className="dot dot-b">Antes de arrancar</h2>
            </Reveal>
          </div>
          <RevealGroup className="faq">
            {[
              ["¿Sirve si no tengo una barbería?", "Sí — Turnito es para cualquier negocio que trabaje con turnos: uñas, pestañas y cejas, tatuajes, peluquería, barbería. Al crear tu cuenta elegís a qué te dedicás y la app se acomoda: te precarga los servicios típicos de tu rubro y habla tu idioma."],
              ["¿Mis clientes tienen que crearse una cuenta?", "No. Reservan con su nombre y su teléfono, y al confirmar reciben un link propio para ver o cancelar su turno. Cero contraseñas."],
              ["Mis sesiones duran varias horas, ¿entra?", "Sí. Un servicio puede durar desde 15 minutos hasta 8 horas, así que una sesión larga de tatuaje ocupa el bloque completo y nadie te puede reservar encima."],
              ["¿Y si no tengo un precio fijo?", "Podés dejar un servicio en \"a consultar\" en vez de poner un número. El cliente reserva igual y el precio lo arreglan entre ustedes."],
              ["¿Qué pasa si un cliente cancela?", "El horario se libera automáticamente y vuelve a estar disponible para cualquier otra persona. Vos lo ves reflejado en tu agenda al instante."],
              ["¿Sirve si trabajo sola?", "Sí, y es el caso más simple: una agenda, tus horarios, tu link. Si algún día sumás gente, cargás al equipo y cada uno pasa a tener su propia agenda sin que tengas que rehacer nada."],
              ["¿Necesito saber de tecnología?", "Si sabés usar WhatsApp, sabés usar Turnito. La configuración son cuatro pantallas guiadas y el uso diario es una sola: la agenda del día."],
              ["¿Cómo se paga? ¿Hay permanencia?", "Por Mercado Pago, mes a mes. Sin contrato: si un mes no lo querés pagar, se pausa y tus datos quedan guardados."],
            ].map(([q, a]) => (
              <Item key={q} variants={fadeUp}>
                <details><summary>{q} <span className="plus">+</span></summary><div className="ans">{a}</div></details>
              </Item>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* CTA FINAL */}
      <div className="final">
        <Reveal variants={scaleIn}>
          <div className="final-card">
            <h2>Tu próximo turno se reserva solo.</h2>
            <p>Configurá tu negocio hoy y probalo 30 días con tus clientes reales.</p>
            <motion.div {...hover} style={{ display: "inline-block" }}>
              <Link className="pill lime" href="/login">Crear mi cuenta gratis <span>→</span></Link>
            </motion.div>
            <div className="final-fine">Sin tarjeta · Sin permanencia · Configuración en 15 minutos</div>
            <div className="wordmark">turnito</div>
          </div>
        </Reveal>
      </div>

      {/* FOOTER */}
      <footer>
        <div className="foot-in">
          <Link className="logo" href="#" style={{ fontSize: 16 }}><LogoMark size={22} /> turnito</Link>
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
    <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
