-- ============================================================================
-- Cupo de reservas por negocio, ENFORCED EN LA BASE
-- Fecha: 2026-08-06
-- Correr en: npm run db:migrate supabase/migrations/0006_booking_caps_trigger.sql
-- (después de 0005_booking_rate_limit.sql)
--
-- POR QUÉ ACÁ Y NO EN EL CÓDIGO:
--
-- 1. No puede fallar abierto. El trigger corre en la MISMA transacción que el
--    insert. Si la base anda, el control corre. Si no anda, no hay insert.
--    El estado "insert sí, control no" simplemente no existe.
--
-- 2. No se puede saltear. Ni con la service role key en la mano. Da igual si
--    mañana aparece otro camino de inserción o alguien toca la base a mano.
--
-- 3. Serializa de verdad (ver el FOR UPDATE más abajo). El chequeo en el
--    código de la app tenía una race condition real: entre el count y el
--    insert había una ventana de red por la que pasaban requests concurrentes.
-- ============================================================================

-- Los cupos viven como columnas y no hardcodeados en la función, así tunearlos
-- es un UPDATE y no una migración nueva. Y cada negocio puede tener el suyo.
alter table public.businesses
  add column if not exists daily_booking_cap  int not null default 40,
  add column if not exists hourly_booking_cap int not null default 15;

comment on column public.businesses.daily_booking_cap is
  'Techo de turnos por día POR AGENDA. El trigger lo multiplica por la cantidad de staff activo (mínimo 1).';
comment on column public.businesses.hourly_booking_cap is
  'Techo de turnos por hora POR AGENDA. Detecta el burst: una agenda no recibe 15 reservas en una hora.';

-- Índices que consulta el trigger. Sin esto, el count escanea la tabla entera
-- en cada insert.
create index if not exists appointments_business_date_idx
  on public.appointments (business_id, date);

create index if not exists appointments_business_created_idx
  on public.appointments (business_id, created_at desc);

create or replace function public.enforce_booking_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap_day   int;
  cap_hour  int;
  n_day     int;
  n_hour    int;
  n_agendas int;
begin
  -- FOR UPDATE: acá está la clave de la correctitud.
  --
  -- Toma un lock sobre la fila de ESTE negocio, así los inserts concurrentes
  -- del mismo local se serializan y el count nunca ve un estado intermedio.
  -- Sin el FOR UPDATE, bajo READ COMMITTED dos transacciones simultáneas
  -- cuentan las dos n-1 y ambas pasan el cupo.
  --
  -- Costo: los inserts de un mismo negocio dejan de ser paralelos. Para una
  -- app de turnos es gratis — no hacés mil reservas por segundo en un local.
  -- Negocios distintos no se bloquean entre sí.
  select daily_booking_cap, hourly_booking_cap
    into cap_day, cap_hour
    from public.businesses
   where id = new.business_id
     for update;

  -- Negocio inexistente: no es asunto nuestro, lo corta la foreign key.
  if cap_day is null then
    return new;
  end if;

  -- EL CUPO ESCALA CON EL EQUIPO.
  --
  -- El techo es por negocio, pero un local con 5 personas tiene 5 agendas en
  -- paralelo y llega a 5x los turnos de uno de una sola silla. Un número fijo
  -- para todos ahoga al grande y no protege al chico.
  --
  -- Multiplicamos por la cantidad de gente activa (mínimo 1, para el negocio
  -- que todavía no cargó a nadie). Así `daily_booking_cap` se lee como
  -- "turnos por día POR AGENDA", que es la unidad que tiene sentido.
  --
  -- Alternativa que descartamos: contar por staff_id. No sirve — los turnos de
  -- la época de una sola agenda tienen staff_id NULL y quedarían sin techo.
  select greatest(1, count(*)) into n_agendas
    from public.staff
   where business_id = new.business_id
     and active = true;

  cap_day  := cap_day  * n_agendas;
  cap_hour := cap_hour * n_agendas;

  -- Los cancelados NO consumen cupo: liberan el horario, así que sería injusto
  -- contarlos. `not like 'cancelled%'` cubre cancelled_by_client y cualquier
  -- variante de cancelación que se agregue más adelante.
  --
  -- El coalesce NO es adorno: `NULL not like 'cancelled%'` evalúa a NULL, no a
  -- true, así que una fila con status nulo NO se contaría y el cupo filtraría
  -- en silencio. Hoy no hay ninguna, pero no quiero que dependa de eso.
  select count(*) into n_day
    from public.appointments
   where business_id = new.business_id
     and date = new.date
     and coalesce(status, '') not like 'cancelled%';

  if n_day >= cap_day then
    raise exception 'BOOKING_CAP_DAY';
  end if;

  select count(*) into n_hour
    from public.appointments
   where business_id = new.business_id
     and created_at >= now() - interval '1 hour'
     and coalesce(status, '') not like 'cancelled%';

  if n_hour >= cap_hour then
    raise exception 'BOOKING_CAP_HOUR';
  end if;

  return new;
end
$$;

drop trigger if exists appointments_enforce_caps on public.appointments;

create trigger appointments_enforce_caps
  before insert on public.appointments
  for each row execute function public.enforce_booking_caps();

-- ═══════════════════════════════════════════════════════════════════════════
-- 🚨 ROLLBACK DE EMERGENCIA
--
-- Si después de aplicar esto las reservas empiezan a fallar, corré ESTA línea
-- y el control se apaga al instante. No pierde un solo dato: las columnas, los
-- índices y la función quedan; solo deja de ejecutarse en cada insert.
--
--     drop trigger if exists appointments_enforce_caps on public.appointments;
--
-- Para volver a prenderlo, sin recrear nada:
--
--     create trigger appointments_enforce_caps
--       before insert on public.appointments
--       for each row execute function public.enforce_booking_caps();
--
-- Alternativa más suave que apagarlo del todo: subir el cupo del negocio que
-- está sufriendo, con el UPDATE de acá abajo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- Para tunear el cupo de un negocio puntual (sin migración).
-- Recordá que los valores son POR AGENDA: el trigger los multiplica por la
-- cantidad de staff activo.
--
--   update public.businesses
--      set daily_booking_cap = 80, hourly_booking_cap = 25
--    where slug = 'tu-slug';
-- ---------------------------------------------------------------------------
