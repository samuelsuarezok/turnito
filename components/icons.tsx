// Íconos de línea de toda la app. Trazos de lucide (licencia ISC), un solo
// grosor (1.5) y `currentColor`, así toman el color del texto que tienen al
// lado y cambian solos entre modo día y noche.
//
// Reemplazan a los emojis que se usaban como íconos (📊 ⚙ 💬 🔔 🕐 📧 💈…): un
// emoji lo dibuja la fuente del sistema, cambia de forma y de color entre
// Windows, Android e iOS, no toma los tokens del tema y un lector de pantalla lo
// lee en voz alta. Todos van aria-hidden: el texto de al lado ya dice qué son.

type P = { size?: number; className?: string };

function Svg({ size = 16, className = "", children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {children}
    </svg>
  );
}

export const IcoCheck = (p: P) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;
export const IcoX = (p: P) => <Svg size={18} {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>;
export const IcoPlus = (p: P) => <Svg size={18} {...p}><path d="M5 12h14" /><path d="M12 5v14" /></Svg>;
export const IcoCopy = (p: P) => <Svg {...p}><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Svg>;
export const IcoChart = (p: P) => <Svg size={18} {...p}><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></Svg>;
export const IcoSliders = (p: P) => <Svg size={18} {...p}><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></Svg>;
export const IcoLogout = (p: P) => <Svg size={18} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Svg>;
export const IcoCampana = (p: P) => <Svg size={18} {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Svg>;
export const IcoReloj = (p: P) => <Svg size={18} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IcoMensaje = (p: P) => <Svg {...p}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></Svg>;
export const IcoDescarga = (p: P) => <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></Svg>;
export const IcoAtras = (p: P) => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>;
export const IcoSeguir = (p: P) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
export const IcoMail = (p: P) => <Svg {...p}><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></Svg>;
export const IcoCalendario = (p: P) => <Svg size={32} {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>;
export const IcoListo = (p: P) => <Svg size={32} {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.4 2.4 2.4 4.6-5" /></Svg>;
