-- ════════════════════════════════════════════════════════════════════════
-- EMAIL DE CONFIRMACIÓN (opcional)
-- Correr en el SQL Editor de Supabase. Idempotente.
--
-- El cliente puede dejar su email al reservar para recibir la confirmación.
-- Es OPCIONAL: si no lo deja, queda NULL y todo funciona igual que antes.
-- ════════════════════════════════════════════════════════════════════════

alter table public.appointments
  add column if not exists client_email text;

-- Refrescar el cache de PostgREST para que vea la columna nueva.
notify pgrst, 'reload schema';
