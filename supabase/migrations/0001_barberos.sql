-- ════════════════════════════════════════════════════════════════════════
-- BARBEROS (multi-barbero por barbería)
-- Correr ENTERO en el SQL Editor de Supabase. Es idempotente: se puede
-- volver a correr sin romper nada.
--
-- Qué agrega:
--   1. Tabla `barbers`            → los barberos del local.
--   2. Tabla `barber_absences`    → días sueltos en que un barbero no está.
--   3. `appointments.barber_id`   → con qué barbero es el turno.
--   4. Índice único por barbero   → dos barberos SÍ pueden tener turno a la
--                                   misma hora; el mismo barbero NO.
--   5. RPCs públicas nuevas       → `public_shop_barbers`, `public_busy_slots_v2`.
--
-- Nota: NO tocamos `public_shop_info` ni `public_busy_slots` (siguen vivas
-- para no romper nada que las use). Las nuevas son aditivas.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Barberos ─────────────────────────────────────────────────────────
create table if not exists public.barbers (
  id            uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name          text not null,
  active        boolean not null default true,   -- false = ya no trabaja acá (baja lógica)
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists barbers_shop_idx on public.barbers (barbershop_id) where active;

-- ── 2. Ausencias puntuales (el barbero no está ESE día) ─────────────────
create table if not exists public.barber_absences (
  id         uuid primary key default gen_random_uuid(),
  barber_id  uuid not null references public.barbers(id) on delete cascade,
  date       date not null,
  reason     text,
  created_at timestamptz not null default now(),
  unique (barber_id, date)
);

create index if not exists barber_absences_date_idx on public.barber_absences (barber_id, date);

-- ── 3. Turnos: a qué barbero corresponde ────────────────────────────────
-- NULL = turno viejo (o barbería de un solo sillón, sin barberos cargados).
-- Un turno con barber_id NULL ocupa a TODOS: era el único sillón.
alter table public.appointments
  add column if not exists barber_id uuid references public.barbers(id) on delete set null;

create index if not exists appointments_barber_date_idx on public.appointments (barber_id, date);

-- ── 4. Unicidad de slot, ahora POR BARBERO ──────────────────────────────
-- El índice viejo era (barbershop_id, date, time): con varios barberos
-- bloquearía a los demás en el mismo horario. Lo reemplazamos.
do $$
declare r record;
begin
  for r in
    select ci.relname as idxname
    from pg_index i
    join pg_class ci on ci.oid = i.indexrelid
    join pg_class ct on ct.oid = i.indrelid
    join pg_namespace n on n.oid = ct.relnamespace
    where n.nspname = 'public'
      and ct.relname = 'appointments'
      and i.indisunique
      and not i.indisprimary
      and ci.relname <> 'appointments_slot_unique'
      and (
        select count(*)
        from unnest(i.indkey) k
        join pg_attribute at on at.attrelid = ct.oid and at.attnum = k
        where at.attname in ('date', 'time')
      ) = 2
  loop
    if exists (
      select 1 from pg_constraint
      where conname = r.idxname and conrelid = 'public.appointments'::regclass
    ) then
      execute format('alter table public.appointments drop constraint %I', r.idxname);
    else
      execute format('drop index public.%I', r.idxname);
    end if;
  end loop;
end $$;

-- Un mismo barbero no puede arrancar dos turnos vigentes a la misma hora.
-- (El solapamiento por duración se valida en /api/book; esto es la red final.)
create unique index if not exists appointments_slot_unique
  on public.appointments (
    barbershop_id,
    coalesce(barber_id, '00000000-0000-0000-0000-000000000000'::uuid),
    date,
    "time"
  )
  where status in ('confirmed', 'done');

-- ── 5. RLS: sólo el dueño de la barbería toca sus barberos ──────────────
alter table public.barbers enable row level security;
alter table public.barber_absences enable row level security;

drop policy if exists barbers_owner_all on public.barbers;
create policy barbers_owner_all on public.barbers
  for all to authenticated
  using (exists (
    select 1 from public.barbershops b
    where b.id = barbers.barbershop_id and b.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.barbershops b
    where b.id = barbers.barbershop_id and b.owner_id = auth.uid()
  ));

drop policy if exists barber_absences_owner_all on public.barber_absences;
create policy barber_absences_owner_all on public.barber_absences
  for all to authenticated
  using (exists (
    select 1 from public.barbers br
    join public.barbershops b on b.id = br.barbershop_id
    where br.id = barber_absences.barber_id and b.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.barbers br
    join public.barbershops b on b.id = br.barbershop_id
    where br.id = barber_absences.barber_id and b.owner_id = auth.uid()
  ));

-- ── 6. RPC pública: barberos de una barbería (+ sus días de ausencia) ───
create or replace function public.public_shop_barbers(shop_slug text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'id', br.id,
        'name', br.name,
        'absences', coalesce((
          select json_agg(a.date order by a.date)
          from public.barber_absences a
          where a.barber_id = br.id and a.date >= current_date
        ), '[]'::json)
      )
      order by br.sort_order, br.name
    ),
    '[]'::json
  )
  from public.barbers br
  join public.barbershops b on b.id = br.barbershop_id
  where b.slug = shop_slug
    and b.subscription_status in ('trial', 'active')
    and br.active;
$$;

grant execute on function public.public_shop_barbers(text) to anon, authenticated;

-- ── 7. RPC pública: ocupados del día, ahora con barber_id ───────────────
-- v2 en vez de tocar `public_busy_slots`: la vieja sigue funcionando igual.
create or replace function public.public_busy_slots_v2(shop_slug text, on_date date)
returns table ("time" time, duration_min int, barber_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select a."time",
         coalesce(s.duration_min, b.slot_minutes) as duration_min,
         a.barber_id
  from public.appointments a
  join public.barbershops b on b.id = a.barbershop_id
  left join public.services s on s.id = a.service_id
  where b.slug = shop_slug
    and a.date = on_date
    and a.status in ('confirmed', 'done');
$$;

grant execute on function public.public_busy_slots_v2(text, date) to anon, authenticated;

-- Refrescar el cache de PostgREST para que vea las tablas nuevas.
notify pgrst, 'reload schema';
