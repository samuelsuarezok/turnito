type Variant = "dark" | "light";

// Isotipo: reloj. Cuadrado azul (primario) con las agujas en lima
// (secundario) — los dos colores de la marca en una sola pieza.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="100" height="100" rx="26" fill="#014CFF" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="#B4EC5C" strokeWidth="7" />
      <line x1="50" y1="50" x2="50" y2="30" stroke="#B4EC5C" strokeWidth="7" strokeLinecap="round" />
      <line x1="50" y1="50" x2="65" y2="50" stroke="#B4EC5C" strokeWidth="7" strokeLinecap="round" />
      <circle cx="50" cy="50" r="5" fill="#B4EC5C" />
    </svg>
  );
}

// Logo completo: isotipo + "turnito"
export default function Logo({
  variant = "dark",
  size = 28,
}: {
  variant?: Variant;
  size?: number;
}) {
  // variant se refiere al FONDO: "dark" = fondo oscuro (texto blanco)
  const textColor = variant === "dark" ? "#FFFFFF" : "#000000";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <LogoMark size={size} />
      <span
        style={{
          fontFamily: "var(--font-urbanist), sans-serif",
          fontWeight: 700,
          fontSize: size * 0.72,
          letterSpacing: "-0.04em",
          color: textColor,
        }}
      >
        turnito
      </span>
    </div>
  );
}
