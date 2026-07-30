"use client";



import Link from "next/link";
import Logo from "@/components/Logo";
import { motion } from "framer-motion";

const UPDATED = "20 de julio de 2026";

export default function LegalesPage() {
  return (
    <main className="min-h-screen bg-[#0C0C0C] text-[#EDEDEA] p-6">
      <div className="max-w-2xl mx-auto py-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-10">
          <Logo variant="dark" size={26} />
          <Link href="/" className="text-[11px] text-[#D8F34E] font-semibold">← Inicio</Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold mb-2">Términos y Privacidad</h1>
          <p className="text-sm text-[#5A5A54] mb-10">Última actualización: {UPDATED}</p>

          {/* índice */}
          <div className="rounded-2xl bg-[#141414] border border-[#262626] p-5 mb-10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-3">Contenido</p>
            <ul className="space-y-1.5 text-sm">
              <li><a href="#terminos" className="text-[#D8F34E] hover:underline">1. Términos y Condiciones de Uso</a></li>
              <li><a href="#privacidad" className="text-[#D8F34E] hover:underline">2. Política de Privacidad</a></li>
            </ul>
          </div>

          {/* ══ TÉRMINOS ══ */}
          <section id="terminos" className="mb-12">
            <h2 className="text-2xl font-bold mb-6">1. Términos y Condiciones de Uso</h2>

            <Block title="1.1 Qué es Turnito">
              Turnito es una plataforma de software que permite a barberías y peluquerías (las &quot;Barberías&quot;)
              gestionar turnos online, y a sus clientes (los &quot;Clientes&quot;) reservar turnos a través de un
              enlace propio. Turnito provee la herramienta; no presta servicios de barbería ni interviene en
              la relación entre la Barbería y sus Clientes.
            </Block>

            <Block title="1.2 Aceptación">
              Al crear una cuenta o utilizar Turnito, aceptás estos Términos. Si no estás de acuerdo, no
              utilices el servicio. Debés ser mayor de 18 años y tener capacidad legal para contratar.
            </Block>

            <Block title="1.3 Cuenta de la Barbería">
              La Barbería es responsable de la veracidad de los datos que carga (nombre, servicios, precios,
              horarios) y de mantener la confidencialidad de su contraseña. Cualquier actividad realizada
              desde su cuenta es su responsabilidad. Una cuenta corresponde a una Barbería.
            </Block>

            <Block title="1.4 Prueba gratuita y suscripción">
              Turnito ofrece un período de prueba gratuito de 7 días. Finalizado ese plazo, para seguir
              utilizando el servicio se requiere una suscripción mensual al precio vigente publicado. La
              suscripción se renueva mes a mes y puede cancelarse en cualquier momento; no hay permanencia
              mínima. Si la suscripción no se abona, el acceso se suspende y el enlace público de reservas
              deja de estar disponible, pero los datos se conservan por un tiempo razonable para una eventual
              reactivación.
            </Block>

            <Block title="1.5 Pagos">
              Los pagos de la suscripción se procesan a través de terceros (por ejemplo, Mercado Pago).
              Turnito no almacena datos de tarjetas. Los precios pueden actualizarse informando con
              antelación razonable. Turnito no cobra comisión a los Clientes por reservar.
            </Block>

            <Block title="1.6 Uso correcto">
              Te comprometés a no usar Turnito para fines ilícitos, a no intentar vulnerar su seguridad, no
              sobrecargar la infraestructura, ni cargar contenido ofensivo o que infrinja derechos de
              terceros. Turnito puede suspender cuentas que incumplan estas condiciones.
            </Block>

            <Block title="1.7 Reservas y responsabilidad de la Barbería">
              La gestión de los turnos, la atención, la política de cancelaciones y el cumplimiento de los
              horarios son responsabilidad exclusiva de cada Barbería. Turnito no garantiza la asistencia de
              los Clientes ni la prestación efectiva del servicio.
            </Block>

            <Block title="1.8 Disponibilidad del servicio">
              Nos esforzamos por mantener Turnito disponible de forma continua, pero el servicio se presta
              &quot;tal cual está&quot;. Pueden existir interrupciones por mantenimiento, fallas técnicas o causas
              ajenas. En la medida permitida por la ley, Turnito no será responsable por lucro cesante ni
              daños indirectos derivados del uso o la imposibilidad de uso de la plataforma.
            </Block>

            <Block title="1.9 Propiedad intelectual">
              El software, la marca &quot;Turnito&quot;, su diseño y sus contenidos son propiedad de Turnito. La
              suscripción otorga un derecho de uso limitado y no exclusivo, sin transferir la propiedad.
            </Block>

            <Block title="1.10 Cancelación de cuenta">
              Podés dejar de usar Turnito y solicitar la baja de tu cuenta cuando quieras. Turnito puede
              rescindir o suspender el acceso ante incumplimientos de estos Términos.
            </Block>

            <Block title="1.11 Modificaciones">
              Podemos actualizar estos Términos. Los cambios relevantes se informarán por los medios de
              contacto disponibles o dentro de la plataforma. El uso continuado luego de una modificación
              implica su aceptación.
            </Block>

            <Block title="1.12 Ley aplicable">
              Estos Términos se rigen por las leyes de la República Argentina. Ante cualquier controversia, se
              aplicará la jurisdicción de los tribunales ordinarios de la Provincia de Córdoba, salvo norma
              de orden público que disponga lo contrario (por ejemplo, en materia de consumidores).
            </Block>
          </section>

          {/* ══ PRIVACIDAD ══ */}
          <section id="privacidad" className="mb-12">
            <h2 className="text-2xl font-bold mb-6">2. Política de Privacidad</h2>

            <Block title="2.1 Responsable">
              El responsable del tratamiento de los datos es Turnito. Para consultas sobre tus datos, escribinos
              al contacto indicado al final. Esta política se enmarca en la Ley 25.326 de Protección de los
              Datos Personales de la República Argentina.
            </Block>

            <Block title="2.2 Qué datos recopilamos">
              <b className="text-[#EDEDEA]">De las Barberías:</b> email, contraseña (encriptada), nombre del
              local, teléfono de contacto, servicios, precios y horarios.<br /><br />
              <b className="text-[#EDEDEA]">De los Clientes:</b> nombre y número de teléfono, que se ingresan
              al reservar un turno, y —de forma <b className="text-[#EDEDEA]">opcional</b>— una dirección de
              email. El email solo se solicita para enviarte la confirmación de tu turno: si preferís no
              dejarlo, podés reservar igual. Los Clientes no crean una cuenta ni establecen contraseña. Estos
              datos se usan únicamente para gestionar y confirmar el turno con la Barbería elegida.
            </Block>

            <Block title="2.3 Para qué los usamos">
              Para operar el servicio: crear y mostrar turnos, confirmar reservas, permitir cancelaciones,
              enviar notificaciones relativas al turno y administrar la suscripción de la Barbería. Si dejaste
              tu email, lo usamos <b className="text-[#EDEDEA]">únicamente</b> para mandarte la confirmación y
              el comprobante de ese turno: no te enviamos publicidad ni newsletters. No usamos los datos para
              publicidad ni los vendemos a terceros.
            </Block>

            <Block title="2.4 Con quién los compartimos">
              Los datos del Cliente se comparten con la Barbería en la que reserva (es quien lo atenderá).
              Utilizamos proveedores de infraestructura y servicios que actúan por cuenta nuestra, como
              alojamiento y base de datos (Supabase), hosting (Vercel), procesamiento de pagos (Mercado Pago)
              y envío de correo electrónico (Brevo). Estos proveedores solo acceden a los datos necesarios
              para prestar su función.
            </Block>

            <Block title="2.5 Conservación">
              Conservamos los datos mientras la cuenta esté activa y durante un plazo razonable posterior para
              cumplir obligaciones legales o contables. Podés solicitar la eliminación de tus datos según se
              indica abajo.
            </Block>

            <Block title="2.6 Seguridad">
              Aplicamos medidas técnicas y organizativas razonables para proteger los datos: contraseñas
              encriptadas, control de acceso a nivel de base de datos y conexiones cifradas. Ningún sistema es
              100% infalible, pero trabajamos para minimizar los riesgos.
            </Block>

            <Block title="2.7 Tus derechos">
              Como titular de los datos, tenés derecho a acceder, rectificar, actualizar y suprimir tus datos
              personales, conforme a la Ley 25.326. Para ejercerlos, escribinos al contacto indicado abajo. La
              Agencia de Acceso a la Información Pública es el organismo de control y puede recibir denuncias
              por incumplimientos.
            </Block>

            <Block title="2.8 Datos de terceros cargados por la Barbería">
              Si una Barbería carga o gestiona datos de sus Clientes a través de Turnito, declara contar con
              base legal para hacerlo y es corresponsable de tratar esos datos conforme a la ley.
            </Block>

            <Block title="2.9 Cambios en esta política">
              Podemos actualizar esta Política de Privacidad. Publicaremos la versión vigente en esta página con
              su fecha de actualización.
            </Block>
          </section>

          {/* contacto */}
          <div className="rounded-2xl bg-[#141414] border border-[#262626] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5A5A54] mb-2">Contacto</p>
            <p className="text-sm text-[#8A7F6A]">
              Para consultas sobre estos términos o tus datos personales, escribinos a{" "}
              <span className="text-[#D8F34E]">labsbebop@gmail.com
</span>{" "}
              
            </p>
          </div>

          <p className="text-[11px] text-[#5A5A54] text-center mt-10">
            © 2026 Turnito · Córdoba, Argentina
          </p>
        </motion.div>
      </div>
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-bold mb-2">{title}</h3>
      <p className="text-sm text-[#8A7F6A] leading-relaxed">{children}</p>
    </div>
  );
}
