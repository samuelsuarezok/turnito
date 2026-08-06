-- ============================================================================
-- Rate limiting de reservas públicas (/api/book)
-- Fecha: 2026-08-06
-- Correr en: npm run db:migrate supabase/migrations/0005_booking_rate_limit.sql
--
-- Contexto: /api/book es el único endpoint público del sistema y usa la
-- service role key, así que saltea RLS y todos los GRANTs. Sin rate limit,
-- cualquiera puede llenar la agenda de un negocio con un loop de curl.
-- ============================================================================

create table if not exists public.booking_attempts (
  id            bigint generated always as identity primary key,
  ip_hash       text        not null,
  business_id uuid        references public.businesses(id) on delete cascade,
  outcome       text        not null,
  created_at    timestamptz not null default now()
);

comment on table public.booking_attempts is
  'Log de intentos de reserva pública. Alimenta el rate limit de /api/book. Solo escribe la service role.';
comment on column public.booking_attempts.ip_hash is
  'SHA-256 de (salt + IP), truncado a 32 chars. Nunca guardamos la IP en claro: es dato personal.';
comment on column public.booking_attempts.outcome is
  'booked | rate_limited | invalid | honeypot';

-- Los dos índices que consulta el rate limit (por IP y por negocio, ventana de 24h).
create index if not exists booking_attempts_ip_time_idx
  on public.booking_attempts (ip_hash, created_at desc);

create index if not exists booking_attempts_business_time_idx
  on public.booking_attempts (business_id, created_at desc);

-- Nadie llega a esta tabla desde el navegador. Solo la service role, que saltea RLS.
-- Ojo: Supabase por defecto le da GRANT a anon/authenticated en las tablas nuevas
-- de public, así que el REVOKE explícito NO es opcional.
alter table public.booking_attempts enable row level security;
revoke all on public.booking_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Limpieza. La tabla solo se consulta con ventana de 24h, así que todo lo más
-- viejo que 30 días es únicamente evidencia forense. Si querés purga
-- automática y tenés pg_cron habilitado, descomentá:
--
-- select cron.schedule(
--   'purge-booking-attempts',
--   '0 4 * * *',
--   $$ delete from public.booking_attempts where created_at < now() - interval '30 days' $$
-- );
--
-- Si no, corré esto a mano de vez en cuando:
--   delete from public.booking_attempts where created_at < now() - interval '30 days';
-- ---------------------------------------------------------------------------
