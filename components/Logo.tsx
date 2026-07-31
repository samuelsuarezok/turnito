// Isotipo: reloj. Los colores salen de los tokens del tema, así que la marca
// cambia sola entre día (cuadrado azul, reloj lima) y noche (cuadrado casi
// negro, reloj lima — el logo original de Turnito).

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="100" height="100" rx="26" fill="var(--c-logo-bg)" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="var(--c-logo-mark)" strokeWidth="7" />
      <line x1="50" y1="50" x2="50" y2="30" stroke="var(--c-logo-mark)" strokeWidth="7" strokeLinecap="round" />
      <line x1="50" y1="50" x2="65" y2="50" stroke="var(--c-logo-mark)" strokeWidth="7" strokeLinecap="round" />
      <circle cx="50" cy="50" r="5" fill="var(--c-logo-mark)" />
    </svg>
  );
}

// Logo completo: isotipo + "turnito"
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <LogoMark size={size} />
      <span
        style={{
          fontFamily: "var(--font-urbanist), sans-serif",
          fontWeight: 700,
          fontSize: size * 0.72,
          letterSpacing: "-0.04em",
          color: "var(--c-ink)",
        }}
      >
        turnito
      </span>
    </div>
  );
}
