"use client";



import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import {
  motion,
  Reveal,
  RevealGroup,
  Item,
  Parallax,
  fadeUp,
  scaleIn,
  slideRight,
  stagger,
  staggerFast,
  EASE,
} from "@/components/motion";

const css = `
.ld{box-sizing:border-box;background:#F2F2EF;color:#101010;font-family:var(--font-inter),sans-serif;font-size:16px;line-height:1.6}
.ld *{box-sizing:border-box;margin:0;padding:0}
.ld h1,.ld h2,.ld h3{font-family:var(--font-grotesk),sans-serif;letter-spacing:-0.03em}
.ld ::selection{background:#D8F34E;color:#101010}
.ld .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.ld nav{position:sticky;top:12px;z-index:100;padding:0 24px}
.ld .nav-in{max-width:1180px;margin:0 auto;background:rgba(255,255,255,0.85);backdrop-filter:blur(14px);border:1px solid #E4E4DF;border-radius:100px;padding:12px 12px 12px 24px;display:flex;align-items:center;justify-content:space-between}
.ld .logo{font-family:var(--font-grotesk),sans-serif;font-weight:700;font-size:19px;letter-spacing:-0.03em;display:flex;align-items:center;gap:9px;text-decoration:none;color:#101010}
.ld .nav-links{display:flex;gap:28px;font-size:14px;font-weight:500}
.ld .nav-links a{color:#6E6E68;text-decoration:none;transition:color .15s}
.ld .nav-links a:hover{color:#101010}
.ld .pill{display:inline-flex;align-items:center;gap:8px;background:#101010;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;transition:transform .15s ease,background .15s}
.ld .pill.lime{background:#D8F34E;color:#101010}
.ld .hero{padding:20px 24px 12px}
.ld .hero-card{max-width:1180px;margin:0 auto;background:#101010;border-radius:40px;padding:72px 64px 0;color:#fff;position:relative;overflow:hidden;display:grid;grid-template-columns:1.15fr .85fr;gap:40px;min-height:640px}
.ld .glow{position:absolute;width:560px;height:560px;border-radius:50%;background:radial-gradient(circle,rgba(216,243,78,0.16),transparent 65%);top:-180px;right:-120px;pointer-events:none}
.ld .hero-copy{padding-bottom:72px;position:relative;z-index:2}
.ld .tag{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,0.18);border-radius:100px;padding:7px 16px;font-size:12.5px;font-weight:500;color:rgba(255,255,255,0.75);margin-bottom:32px}
.ld .tag b{color:#D8F34E;font-weight:600}
.ld .hero h1{font-size:clamp(42px,5.4vw,68px);line-height:1.02;font-weight:700;margin-bottom:24px}
.ld .hero h1 .hl{color:#D8F34E}
.ld .hero p.sub{font-size:17px;color:rgba(255,255,255,0.62);max-width:440px;margin-bottom:36px;line-height:1.65}
.ld .hero-ctas{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:36px}
.ld .ghost{color:rgba(255,255,255,0.75);font-size:14px;font-weight:500;text-decoration:none;padding:12px 8px}
.ld .hero-meta{display:flex;gap:28px;flex-wrap:wrap}
.ld .hm{display:flex;flex-direction:column;gap:2px}
.ld .hm b{font-family:var(--font-grotesk),sans-serif;font-size:22px;font-weight:700;color:#fff}
.ld .hm span{font-size:12px;color:rgba(255,255,255,0.5)}
.ld .hero-phone-zone{position:relative;display:flex;align-items:flex-end;justify-content:center}
.ld .phone{width:300px;background:#1E1E1E;border:1.5px solid #333;border-radius:44px 44px 0 0;padding:14px 14px 0;box-shadow:0 -20px 80px rgba(0,0,0,0.5);position:relative;z-index:2}
.ld .phone-notch{width:110px;height:26px;background:#000;border-radius:100px;margin:4px auto 12px}
.ld .screen{background:#0C0C0C;border-radius:30px 30px 0 0;padding:18px 16px 24px;min-height:420px}
.ld .scr-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.ld .scr-shop{font-family:var(--font-grotesk),sans-serif;font-weight:700;font-size:15px;color:#fff}
.ld .scr-sub{font-size:10px;color:#6E6E68;margin-top:1px}
.ld .scr-badge{background:rgba(216,243,78,0.14);color:#D8F34E;font-size:9px;font-weight:700;padding:4px 10px;border-radius:100px;letter-spacing:0.04em}
.ld .scr-label{font-size:9.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#5A5A54;margin:14px 0 8px}
.ld .chiprow{display:flex;gap:6px}
.ld .chip{flex:1;background:#181818;border:1.5px solid #262626;border-radius:14px;padding:10px 6px;text-align:center}
.ld .chip.on{border-color:#D8F34E;background:rgba(216,243,78,0.08)}
.ld .chip b{display:block;font-size:11px;color:#EDEDEA;font-weight:600}
.ld .chip span{font-size:10px;color:#D8F34E;font-weight:600}
.ld .dayrow{display:flex;gap:6px}
.ld .day{flex:1;background:#181818;border:1.5px solid #262626;border-radius:12px;padding:7px 2px;text-align:center}
.ld .day.on{border-color:#D8F34E;background:rgba(216,243,78,0.08)}
.ld .day em{display:block;font-style:normal;font-size:8px;color:#5A5A54;text-transform:uppercase}
.ld .day b{font-size:13px;color:#EDEDEA}
.ld .day.on b,.ld .day.on em{color:#D8F34E}
.ld .slotgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.ld .slot{background:#181818;border:1.5px solid #262626;border-radius:10px;padding:7px 2px;text-align:center;font-size:10px;font-weight:600;color:#C9C9C4}
.ld .slot.on{background:#D8F34E;border-color:#D8F34E;color:#101010}
.ld .slot.off{opacity:.25;text-decoration:line-through}
.ld .scr-btn{margin-top:16px;background:#D8F34E;color:#101010;border-radius:100px;padding:12px;text-align:center;font-size:12px;font-weight:700}
.ld .strip{padding:56px 24px 8px}
.ld .strip-in{max-width:1180px;margin:0 auto;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:center}
.ld .strip-item{font-size:13.5px;color:#6E6E68;display:flex;align-items:center;gap:10px;font-weight:500}
.ld .strip-item .dot{width:7px;height:7px;border-radius:50%;background:#D8F34E;outline:3px solid rgba(216,243,78,0.4)}
.ld section{padding:88px 24px;display:block}
.ld .sec-head{max-width:1180px;margin:0 auto 48px;display:flex;align-items:flex-end;justify-content:space-between;gap:32px;flex-wrap:wrap}
.ld .kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6E6E68;margin-bottom:16px}
.ld .kicker::before{content:'';width:22px;height:2px;background:#D8F34E;border-radius:2px}
.ld h2{font-size:clamp(32px,4vw,50px);line-height:1.05;font-weight:700;max-width:560px}
.ld .sec-head p{max-width:340px;color:#6E6E68;font-size:15px}
.ld .bento{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.ld .card{background:#fff;border:1px solid #E4E4DF;border-radius:28px;padding:34px 30px;display:flex;flex-direction:column;height:100%}
.ld .card.big{grid-column:span 2}
.ld .card.dark{background:#101010;color:#fff;border-color:#101010}
.ld .card.lime{background:#D8F34E;border-color:#D8F34E}
.ld .card-ic{width:46px;height:46px;border-radius:14px;background:#F2F2EF;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:22px}
.ld .card.dark .card-ic{background:rgba(255,255,255,0.08)}
.ld .card.lime .card-ic{background:rgba(16,16,16,0.08)}
.ld .card h3{font-size:19px;font-weight:700;margin-bottom:10px}
.ld .card p{font-size:14px;color:#6E6E68;line-height:1.65}
.ld .card.dark p{color:rgba(255,255,255,0.6)}
.ld .card.lime p{color:rgba(16,16,16,0.65)}
.ld .card .num{font-family:var(--font-grotesk),sans-serif;font-size:46px;font-weight:700;line-height:1;margin-bottom:6px}
.ld .card .numlbl{font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;opacity:.6}
.ld .steps-wrap{max-width:1180px;margin:0 auto;background:#101010;border-radius:40px;padding:72px 64px;color:#fff}
.ld .steps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:52px}
.ld .stepc{background:#1A1A1A;border:1px solid #262626;border-radius:24px;padding:30px 26px;position:relative;height:100%}
.ld .step-badge{position:absolute;top:-14px;left:24px;background:#D8F34E;color:#101010;font-family:var(--font-grotesk),sans-serif;font-weight:700;font-size:13px;padding:5px 14px;border-radius:100px}
.ld .stepc h3{font-size:17px;font-weight:700;margin:14px 0 8px}
.ld .stepc p{font-size:13.5px;color:rgba(255,255,255,0.55);line-height:1.65}
.ld .stepc .mono{font-family:var(--font-grotesk),sans-serif;color:#D8F34E;font-size:13px;font-weight:600}
.ld .pricing{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch}
.ld .price-copy{padding:40px 30px;display:flex;flex-direction:column;justify-content:center}
.ld .price-copy h2{margin-bottom:18px}
.ld .price-copy p{color:#6E6E68;font-size:15px;max-width:400px;margin-bottom:12px}
.ld .price-card{background:#101010;color:#fff;border-radius:28px;padding:44px 40px;position:relative;overflow:hidden}
.ld .price-card .glow2{position:absolute;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(216,243,78,0.14),transparent 65%);bottom:-160px;right:-100px;pointer-events:none}
.ld .price-tag{display:inline-block;background:rgba(216,243,78,0.14);color:#D8F34E;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:6px 14px;border-radius:100px;margin-bottom:26px}
.ld .price-num{font-family:var(--font-grotesk),sans-serif;font-size:62px;font-weight:700;line-height:1;letter-spacing:-0.03em}
.ld .price-num small{font-size:17px;color:rgba(255,255,255,0.5);font-weight:500;letter-spacing:0}
.ld .price-note{font-size:13px;color:rgba(255,255,255,0.45);margin:6px 0 28px}
.ld .pl{list-style:none;margin-bottom:32px}
.ld .pl li{display:flex;align-items:center;gap:12px;padding:10px 0;font-size:14.5px;color:rgba(255,255,255,0.8);border-bottom:1px solid rgba(255,255,255,0.07)}
.ld .pl li:last-child{border:none}
.ld .pl .check{width:20px;height:20px;border-radius:50%;background:#D8F34E;color:#101010;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.ld .price-fine{font-size:12px;color:rgba(255,255,255,0.4);margin-top:14px;text-align:center}
.ld .faq{max-width:760px;margin:0 auto}
.ld details{background:#fff;border:1px solid #E4E4DF;border-radius:20px;margin-bottom:10px;overflow:hidden}
.ld summary{padding:22px 26px;cursor:pointer;font-family:var(--font-grotesk),sans-serif;font-size:16px;font-weight:600;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px}
.ld summary::-webkit-details-marker{display:none}
.ld .plus{width:30px;height:30px;border-radius:50%;background:#F2F2EF;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;transition:transform .2s,background .2s}
.ld details[open] .plus{transform:rotate(45deg);background:#D8F34E}
.ld details .ans{padding:0 26px 24px;font-size:14.5px;color:#6E6E68;line-height:1.7;max-width:600px}
.ld .final{padding:88px 24px 100px}
.ld .final-card{max-width:1180px;margin:0 auto;background:#D8F34E;border-radius:40px;padding:88px 64px;text-align:center;position:relative;overflow:hidden}
.ld .final-card h2{max-width:640px;margin:0 auto 16px;font-size:clamp(36px,4.6vw,58px)}
.ld .final-card p{color:rgba(16,16,16,0.6);font-size:16px;margin-bottom:36px}
.ld .final-card .pill{background:#101010;color:#fff;font-size:15px;padding:16px 34px}
.ld .final-fine{font-size:13px;color:rgba(16,16,16,0.5);margin-top:16px}
.ld footer{padding:0 24px 32px;display:block}
.ld .foot-in{max-width:1180px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;padding:24px 4px;border-top:1px solid #E4E4DF}
.ld .foot-in>span{font-size:13px;color:#6E6E68}
.ld .foot-links{display:flex;gap:24px}
.ld .foot-links a{font-size:13px;color:#6E6E68;text-decoration:none}
@media(max-width:960px){
  .ld .hero-card{grid-template-columns:1fr;padding:48px 28px 0;min-height:auto}
  .ld .bento{grid-template-columns:1fr}
  .ld .card.big{grid-column:span 1}
  .ld .steps-wrap{padding:48px 28px}
  .ld .steps-grid{grid-template-columns:1fr;gap:26px}
  .ld .pricing{grid-template-columns:1fr}
  .ld .nav-links{display:none}
  .ld .sec-head{flex-direction:column;align-items:flex-start}
  .ld .final-card{padding:64px 28px}
}
`;

const hover = { whileHover: { scale: 1.03 }, whileTap: { scale: 0.97 } };
const cardHover = { whileHover: { y: -6, transition: { duration: 0.2 } } };

export default function LandingPage() {
  return (
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
            <a href="#como">Cómo funciona</a>
            <a href="#features">Qué incluye</a>
            <a href="#precio">Precio</a>
            <a href="#faq">Preguntas</a>
          </div>
          <motion.div {...hover}>
            <Link className="pill" href="/login">Empezar gratis</Link>
          </motion.div>
        </div>
      </motion.nav>

      {/* HERO */}
      <header className="hero">
        <div className="hero-card">
          <div className="glow" />
          <motion.div className="hero-copy" variants={stagger} initial="hidden" animate="show">
            <motion.div className="tag" variants={fadeUp}>Para barberías y más · <b>30 días gratis</b></motion.div>
            <motion.h1 variants={fadeUp}>Los turnos de tu negocio, <span className="hl">en piloto automático.</span></motion.h1>
            <motion.p className="sub" variants={fadeUp}>Tus clientes reservan solos desde un link, sin crearse cuentas ni descargar nada. Vos abrís tu panel y sabés exactamente quién sigue.</motion.p>
            <motion.div className="hero-ctas" variants={fadeUp}>
              <motion.div {...hover}><Link className="pill lime" href="/login">Probar 30 días gratis <span>→</span></Link></motion.div>
              <a className="ghost" href="#como">Ver cómo funciona ↓</a>
            </motion.div>
            <motion.div className="hero-meta" variants={stagger}>
              {[["15 min","de configuración"],["24/7","reservas abiertas"],["0","apps para tus clientes"]].map(([b,s])=>(
                <motion.div className="hm" key={b} variants={fadeUp}><b>{b}</b><span>{s}</span></motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* teléfono con float + parallax */}
          <div className="hero-phone-zone">
            <motion.div
              initial={{ y: 80, opacity: 0, rotate: -3 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.2 }}
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="phone">
                  <div className="phone-notch"></div>
                  <div className="screen">
                    <div className="scr-head">
                      <div><div className="scr-shop">Barbería El Toro</div><div className="scr-sub">turnito.app/el-toro</div></div>
                      <div className="scr-badge">ONLINE</div>
                    </div>
                    <div className="scr-label">Servicio</div>
                    <div className="chiprow">
                      <div className="chip on"><b>Corte</b><span>$3.500</span></div>
                      <div className="chip"><b>Barba</b><span>$2.000</span></div>
                      <div className="chip"><b>Combo</b><span>$5.000</span></div>
                    </div>
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
            </motion.div>
          </div>
        </div>
      </header>

      {/* STRIP */}
      <div className="strip">
        <RevealGroup className="strip-in" variants={staggerFast}>
          {["Sin app para el cliente","Comprobante con link propio","Cancelación online","Sin permanencia"].map(t=>(
            <Item className="strip-item" key={t} variants={fadeUp}><span className="dot"></span>{t}</Item>
          ))}
        </RevealGroup>
      </div>

      {/* FEATURES */}
      <section id="features">
        <div className="sec-head">
          <Reveal>
            <div className="kicker">Qué incluye</div>
            <h2>Todo lo que necesitás. Nada que te sobre.</h2>
          </Reveal>
          <Reveal variants={fadeUp}><p>Una sola herramienta con un solo trabajo: que tu agenda se llene sola y vos solo tengas que cortar.</p></Reveal>
        </div>
        <RevealGroup className="bento">
          <Item className="card big dark" variants={scaleIn}>
            <motion.div style={{height:"100%",display:"flex",flexDirection:"column"}} {...cardHover}>
              <div className="card-ic">🔗</div>
              <h3>Tu link propio de reservas</h3>
              <p>turnito.app/tu-barberia — lo ponés en el bio de Instagram, lo mandás por WhatsApp o lo imprimís en QR. El cliente entra, ve tus horarios libres reales y reserva en menos de un minuto. Sin registro, sin contraseñas, sin descargar nada.</p>
            </motion.div>
          </Item>
          <Item className="card lime" variants={scaleIn}>
            <motion.div style={{height:"100%"}} {...cardHover}>
              <div className="num">24/7</div><div className="numlbl">Reservas abiertas</div>
              <p style={{marginTop:12}}>Te llegan turnos mientras cortás, mientras cenás y mientras dormís.</p>
            </motion.div>
          </Item>
          {[["📅","Agenda que se ordena sola","Cada reserva cae en su lugar. Los horarios ocupados se bloquean al instante para todos los demás."],
            ["🎟️","Comprobante al instante","Apenas reserva, el cliente recibe un link propio con los datos de su turno para verlo o cancelarlo cuando quiera."],
            ["🔓","Cancelaciones que liberan","Si alguien cancela, el horario vuelve a estar disponible al segundo. Nadie tiene que avisarte nada."]].map(([ic,h,p])=>(
            <Item className="card" key={h} variants={scaleIn}>
              <motion.div style={{height:"100%"}} {...cardHover}>
                <div className="card-ic">{ic}</div><h3>{h}</h3><p>{p}</p>
              </motion.div>
            </Item>
          ))}
        </RevealGroup>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como">
        <Reveal variants={scaleIn}>
          <div className="steps-wrap">
            <div className="kicker" style={{color:"rgba(255,255,255,0.5)"}}>Cómo funciona</div>
            <h2 style={{color:"#fff"}}>De cero a recibir turnos<br/>en tres pasos.</h2>
            <RevealGroup className="steps-grid">
              {[["01","Configurá tu barbería",<>Nombre, servicios con precio y duración, y tus horarios. Son tres pantallas, <span className="mono">~15 minutos</span>, una sola vez.</>],
                ["02","Compartí tu link",<>Te damos tu dirección propia: <span className="mono">turnito.app/tu-barberia</span>. La ponés donde ya hablás con tus clientes.</>],
                ["03","Cortá con la agenda abierta",<>Tu panel te muestra quién sigue, qué pidió y a qué hora. Un botón para el siguiente. <span className="mono">Eso es todo.</span></>]].map(([n,h,p],i)=>(
                <Item key={i as number} variants={fadeUp}>
                  <div className="stepc"><div className="step-badge">{n}</div><h3>{h}</h3><p>{p}</p></div>
                </Item>
              ))}
            </RevealGroup>
          </div>
        </Reveal>
      </section>

      {/* PRECIO */}
      <section id="precio">
        <div className="pricing">
          <Reveal className="price-copy">
            <div className="kicker">Precio</div>
            <h2>Un solo plan. Sin letra chica.</h2>
            <p>Nada de versión básica recortada ni &quot;premium&quot; con lo que de verdad necesitás. Un plan con todo, y una prueba gratis para decidir tranquilo.</p>
            <p style={{fontWeight:600,color:"#101010"}}>Si en 30 días no te sirvió, no ponés un peso.</p>
          </Reveal>
          <Reveal variants={scaleIn}>
            <div className="price-card">
              <div className="glow2" />
              <div className="price-tag">Plan único</div>
              <div className="price-num">$40.000<small> ARS/mes</small></div>
              <div className="price-note">IVA incluido · con factura · por Mercado Pago</div>
              <motion.ul className="pl" variants={staggerFast} initial="hidden" whileInView="show" viewport={{once:true,amount:0.2}}>
                {["Reservas online ilimitadas","Tu link propio: turnito.app/tu-barberia","Panel con la agenda del día","Comprobante online para cada turno","Cancelación online para tus clientes","Soporte directo por WhatsApp","Sin contrato, sin permanencia"].map(t=>(
                  <motion.li key={t} variants={slideRight}><span className="check">✓</span>{t}</motion.li>
                ))}
              </motion.ul>
              <motion.div {...hover}><Link className="pill lime" href="/login" style={{width:"100%",justifyContent:"center"}}>Empezar mis 30 días gratis <span>→</span></Link></motion.div>
              <div className="price-fine">No pedimos tarjeta para probar.</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq">
        <div className="sec-head" style={{marginBottom:36}}>
          <Reveal><div className="kicker">Preguntas</div><h2>Antes de arrancar.</h2></Reveal>
        </div>
        <RevealGroup className="faq">
          {[["¿Mis clientes tienen que crearse una cuenta?","No. Reservan con su nombre y su teléfono, y al confirmar reciben un link propio para ver o cancelar su turno. Cero contraseñas."],
            ["¿Qué pasa si un cliente cancela?","El horario se libera automáticamente y vuelve a estar disponible para cualquier otra persona. Vos lo ves reflejado en tu agenda al instante."],
            ["¿Sirve si trabajo solo?","Sí — está pensado primero para eso: una barbería, una agenda. Simple y directo."],
            ["¿Necesito saber de tecnología?","Si sabés usar WhatsApp, sabés usar Turnito. La configuración son tres pantallas guiadas y el uso diario es una sola: la agenda del día."],
            ["¿Cómo se paga? ¿Hay permanencia?","Por Mercado Pago, mes a mes. Sin contrato: si un mes no lo querés pagar, se pausa y tus datos quedan guardados."]].map(([q,a])=>(
            <Item key={q} variants={fadeUp}>
              <details><summary>{q} <span className="plus">+</span></summary><div className="ans">{a}</div></details>
            </Item>
          ))}
        </RevealGroup>
      </section>

      {/* CTA FINAL */}
      <div className="final">
        <Reveal variants={scaleIn}>
          <div className="final-card">
            <h2>Tu próximo turno se reserva solo.</h2>
            <p>Configurá tu barbería hoy y probalo 30 días con tus clientes reales.</p>
            <motion.div {...hover} style={{display:"inline-block"}}><Link className="pill" href="/login">Crear mi barbería gratis <span>→</span></Link></motion.div>
            <div className="final-fine">Sin tarjeta · Sin permanencia · Configuración en 15 minutos</div>
          </div>
        </Reveal>
      </div>

      {/* FOOTER */}
      <footer>
        <div className="foot-in">
          <Link className="logo" href="#" style={{fontSize:16}}><LogoMark size={22} /> turnito</Link>
          <div className="foot-links">
              <a href="#">Contacto</a>
              <a href="#">WhatsApp</a>
  <Link href="/legales">Términos y Privacidad</Link>
</div>
          <span>© 2026 Turnito · Córdoba, Argentina</span>
        </div>
      </footer>
    </div>
  );
}
