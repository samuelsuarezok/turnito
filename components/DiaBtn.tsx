"use client";

// Un día de la tira de 7. Es el mismo botón en la reserva pública, en el panel,
// en "cargar un turno" y en "mover turno": antes eran cuatro copias que ya se
// habían desparejado (distinto alto, distinto borde, mayúsculas en una sí y en
// otra no).

export default function DiaBtn({ fecha, label, on, disabled = false, onClick }: {
  fecha: Date; label: string; on: boolean; disabled?: boolean; onClick: () => void;
}) {
  const marcado = on && !disabled;
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={on}
      className={`shrink-0 w-14 h-16 rounded-xl border flex flex-col items-center justify-center transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${
        disabled ? "border-transparent bg-canvas opacity-60 cursor-not-allowed active:scale-100"
          : on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-faint"}`}>
      <span className={`text-[12px] leading-4 ${marcado ? "text-accent-ink" : "text-muted"}`}>{label}</span>
      <span className={`text-[18px] leading-6 font-semibold tabular-nums ${
        disabled ? "text-faint line-through" : marcado ? "text-accent-ink" : "text-ink"}`}>
        {fecha.getDate()}
      </span>
    </button>
  );
}
