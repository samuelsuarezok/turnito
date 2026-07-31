-- ════════════════════════════════════════════════════════════════════════
-- RENAME: el schema deja de hablar de barberías
--
--   barbershops     → businesses
--   barbers         → staff
--   barber_absences → staff_absences
--   *.barbershop_id → business_id
--   *.barber_id     → staff_id
--
-- Correr con:  npm run db:migrate supabase/migrations/0004_rename_generico.sql --dry
-- y recién después sin --dry. Todo va en UNA transacción: si algo falla, la
-- base queda exactamente como estaba.
--
-- Es idempotente: cada paso chequea antes de tocar. Se puede volver a correr.
--
-- CUTOVER SIN VENTANA ROTA: las RPC viejas siguen existiendo como wrappers que
-- llaman a las nuevas, así que podés correr esta migración y desplegar el
-- código en cualquier orden. Los wrappers se borran en la 0005, cuando el
-- código nuevo ya esté arriba y estable.
--
-- Lo que Postgres actualiza SOLO al renombrar (no hace falta tocarlo):
--   · foreign keys y sus targets
--   · definiciones de índices
--   · expresiones de las RLS policies (se guardan parseadas, no como texto)
-- Lo que NO actualiza y por eso está acá abajo:
--   · los cuerpos de las funciones, que son texto plano
--   · los NOMBRES de constraints e índices, que son cosméticos
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. TABLAS ───────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select * from (values
    ('barbershops',     'businesses'),
    ('barbers',         'staff'),
    ('barber_absences', 'staff_absences')
  ) as t(vieja, nueva)
  loop
    if to_regclass('public.' || r.vieja) is not null then
      execute format('alter table public.%I rename to %I', r.vieja, r.nueva);
      raise notice 'tabla  %  →  %', r.vieja, r.nueva;
    end if;
  end loop;
end $$;


-- ── 2. COLUMNAS ─────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select * from (values
    ('appointments',   'barbershop_id', 'business_id'),
    ('services',       'barbershop_id', 'business_id'),
    ('opening_hours',  'barbershop_id', 'business_id'),
    ('closed_dates',   'barbershop_id', 'business_id'),
    ('staff',          'barbershop_id', 'business_id'),
    ('appointments',   'barber_id',     'staff_id'),
    ('staff_absences', 'barber_id',     'staff_id')
  ) as t(tabla, vieja, nueva)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tabla and column_name = r.vieja
    ) then
      execute format('alter table public.%I rename column %I to %I', r.tabla, r.vieja, r.nueva);
      raise notice 'columna  %.%  →  %', r.tabla, r.vieja, r.nueva;
    end if;
  end loop;
end $$;


-- ── 3. CONSTRAINTS (cosmético: los nombres viejos quedan si no se tocan) ─
do $$
declare r record;
begin
  for r in select * from (values
    ('appointments',   'appointments_barber_id_fkey',        'appointments_staff_id_fkey'),
    ('appointments',   'appointments_barbershop_id_fkey',    'appointments_business_id_fkey'),
    ('staff_absences', 'barber_absences_barber_id_date_key', 'staff_absences_staff_id_date_key'),
    ('staff_absences', 'barber_absences_barber_id_fkey',     'staff_absences_staff_id_fkey'),
    ('staff_absences', 'barber_absences_pkey',               'staff_absences_pkey'),
    ('staff',          'barbers_barbershop_id_fkey',         'staff_business_id_fkey'),
    ('staff',          'barbers_pkey',                       'staff_pkey'),
    ('businesses',     'barbershops_business_type_check',    'businesses_business_type_check'),
    ('businesses',     'barbershops_owner_id_fkey',          'businesses_owner_id_fkey'),
    ('businesses',     'barbershops_pkey',                   'businesses_pkey'),
    ('businesses',     'barbershops_slug_key',               'businesses_slug_key'),
    ('closed_dates',   'closed_dates_barbershop_id_date_key','closed_dates_business_id_date_key'),
    ('closed_dates',   'closed_dates_barbershop_id_fkey',    'closed_dates_business_id_fkey'),
    ('opening_hours',  'opening_hours_barbershop_id_fkey',   'opening_hours_business_id_fkey'),
    ('services',       'services_barbershop_id_fkey',        'services_business_id_fkey')
  ) as t(tabla, vieja, nueva)
  loop
    if exists (
      select 1 from pg_constraint c
      join pg_class k on k.oid = c.conrelid
      join pg_namespace n on n.oid = k.relnamespace
      where n.nspname = 'public' and k.relname = r.tabla and c.conname = r.vieja
    ) then
      execute format('alter table public.%I rename constraint %I to %I', r.tabla, r.vieja, r.nueva);
      raise notice 'constraint  %  →  %', r.vieja, r.nueva;
    end if;
  end loop;
end $$;


-- ── 4. ÍNDICES sueltos ──────────────────────────────────────────────────
-- (los que respaldan constraints ya se renombraron solos en el paso 3)
do $$
declare r record;
begin
  for r in select * from (values
    ('appointments_barber_date_idx', 'appointments_staff_date_idx'),
    ('barber_absences_date_idx',     'staff_absences_date_idx'),
    ('barbers_shop_idx',             'staff_business_idx'),
    ('barbershops_owner',            'businesses_owner')
  ) as t(vieja, nueva)
  loop
    if to_regclass('public.' || r.vieja) is not null then
      execute format('alter index public.%I rename to %I', r.vieja, r.nueva);
      raise notice 'índice  %  →  %', r.vieja, r.nueva;
    end if;
  end loop;
end $$;


-- ── 5. FUNCIONES ────────────────────────────────────────────────────────
-- Los cuerpos son texto: el rename de tablas NO los toca. Van recreados a
-- mano desde su definición real (ver supabase/schema.snapshot.sql).
--
-- De paso: las cuatro que estaban SECURITY DEFINER sin `set search_path`
-- ahora lo fijan. Sin eso, la función corre con permisos del owner pero
-- resuelve los nombres de tabla con el search_path de quien la llama.

create or replace function public.public_shop_info(shop_slug text)
returns json
language sql
stable
security definer
set search_path = public
as $function$
  select json_build_object(
    'name', b.name,
    'slug', b.slug,
    'slot_minutes', b.slot_minutes,
    'min_notice_min', b.min_notice_min,
    'business_type', b.business_type,
    'services', (
      select coalesce(json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'icon', s.icon,
        'duration_min', s.duration_min, 'price', s.price
      ) order by s.sort_order), '[]')
      from services s where s.business_id = b.id and s.active
    ),
    'hours', (
      select coalesce(json_agg(json_build_object(
        'weekday', h.weekday, 'opens_at', h.opens_at, 'closes_at', h.closes_at
      )), '[]')
      from opening_hours h where h.business_id = b.id
    ),
    'closed', (
      select coalesce(json_agg(json_build_object(
        'date', c.date, 'from_time', c.from_time, 'to_time', c.to_time
      )), '[]')
      from closed_dates c where c.business_id = b.id and c.date >= current_date
    )
  )
  from businesses b
  where b.slug = shop_slug and b.subscription_status in ('trial','active');
$function$;

create or replace function public.public_appointment_by_token(t text)
returns json
language sql
stable
security definer
set search_path = public
as $function$
  select json_build_object(
    'shop_name', b.name,
    'client_name', a.client_name,
    'service', s.name,
    'date', a.date,
    'time', a.time,
    'status', a.status,
    'can_cancel', (
      a.status = 'confirmed'
      and (a.date + a.time) > (now() at time zone b.timezone) + make_interval(mins => b.cancel_limit_min)
    )
  )
  from appointments a
  join businesses b on b.id = a.business_id
  join services s on s.id = a.service_id
  where a.token = t;
$function$;

create or replace function public.public_cancel_by_token(t text)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare ok boolean;
begin
  update appointments a
  set status = 'cancelled_by_client', cancelled_at = now()
  from businesses b
  where a.token = t
    and a.status = 'confirmed'
    and b.id = a.business_id
    and (a.date + a.time) > (now() at time zone b.timezone) + make_interval(mins => b.cancel_limit_min);
  ok := found;
  return json_build_object('ok', ok);
end; $function$;

create or replace function public.public_busy_slots(shop_slug text, on_date date)
returns json
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(json_agg(json_build_object(
    'time', a.time, 'duration_min', s.duration_min
  )), '[]')
  from appointments a
  join businesses b on b.id = a.business_id
  join services s on s.id = a.service_id
  where b.slug = shop_slug
    and a.date = on_date
    and a.status in ('confirmed','done');
$function$;


-- ── 6. RPC nuevas + wrappers de compatibilidad ──────────────────────────
-- El nombre nuevo es el bueno. El viejo queda como wrapper para que puedas
-- desplegar el código cuando quieras, sin ventana rota.

create or replace function public.public_shop_staff(shop_slug text)
returns json
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    json_agg(
      json_build_object(
        'id', st.id,
        'name', st.name,
        'absences', coalesce((
          select json_agg(a.date order by a.date)
          from public.staff_absences a
          where a.staff_id = st.id and a.date >= current_date
        ), '[]'::json)
      )
      order by st.sort_order, st.name
    ),
    '[]'::json
  )
  from public.staff st
  join public.businesses b on b.id = st.business_id
  where b.slug = shop_slug
    and b.subscription_status in ('trial', 'active')
    and st.active;
$function$;

-- v3 = v2 con la columna renombrada a staff_id. v2 queda viva y sin cambios,
-- devolviendo barber_id, para el código que todavía no se desplegó.
create or replace function public.public_busy_slots_v3(shop_slug text, on_date date)
returns table ("time" time without time zone, duration_min integer, staff_id uuid)
language sql
stable
security definer
set search_path = public
as $function$
  select a."time",
         coalesce(s.duration_min, b.slot_minutes) as duration_min,
         a.staff_id
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  left join public.services s on s.id = a.service_id
  where b.slug = shop_slug
    and a.date = on_date
    and a.status in ('confirmed', 'done');
$function$;

-- Wrappers: mismo nombre y misma forma de salida que antes.
create or replace function public.public_shop_barbers(shop_slug text)
returns json
language sql
stable
security definer
set search_path = public
as $function$
  select public.public_shop_staff(shop_slug);
$function$;

create or replace function public.public_busy_slots_v2(shop_slug text, on_date date)
returns table ("time" time without time zone, duration_min integer, barber_id uuid)
language sql
stable
security definer
set search_path = public
as $function$
  select v."time", v.duration_min, v.staff_id
  from public.public_busy_slots_v3(shop_slug, on_date) v;
$function$;

grant execute on function public.public_shop_staff(text)                     to anon, authenticated;
grant execute on function public.public_shop_barbers(text)                   to anon, authenticated;
grant execute on function public.public_busy_slots_v3(text, date)            to anon, authenticated;
grant execute on function public.public_busy_slots_v2(text, date)            to anon, authenticated;
grant execute on function public.public_busy_slots(text, date)               to anon, authenticated;
grant execute on function public.public_shop_info(text)                      to anon, authenticated;
grant execute on function public.public_appointment_by_token(text)           to anon, authenticated;
grant execute on function public.public_cancel_by_token(text)                to anon, authenticated;

-- pgrst_ddl_watch ya recarga el cache solo, pero no cuesta nada.
notify pgrst, 'reload schema';
