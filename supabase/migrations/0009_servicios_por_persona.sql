-- ============================================================================
-- Qué servicio hace cada persona del equipo
-- Fecha: 2026-08-08
-- Correr en: npm run db:migrate supabase/migrations/0009_servicios_por_persona.sql
-- (después de 0008_precio_en_turno.sql)
--
-- EL PROBLEMA QUE ARREGLA
--
-- `services` y `staff` hoy no se conocen entre sí. `appointments` guarda las dos
-- referencias pero nada valida que esa persona haga ese servicio, ni en la base
-- ni en /api/book, que sólo chequea que la persona pertenezca al negocio.
--
-- En una barbería que además tiene un tatuador y alguien de piercings, un
-- cliente que elige "Tatuaje" puede reservarle a cualquiera de los barberos.
-- No es una feature que falta: es un bug que ya está en producción.
--
-- LA REGLA, Y POR QUÉ ES ASÍ
--
--   Un servicio SIN filas acá lo hace TODO el equipo.
--
-- O sea que la tabla vacía = exactamente el comportamiento de hoy. Ningún
-- negocio existente se rompe ni necesita backfill, y la feature queda opt-in:
-- el dueño empieza a restringir sólo cuando le hace falta.
--
-- La alternativa era backfillear todos los pares servicio×persona y que vacío
-- signifique "nadie". Se descartó: con esa regla, cada persona nueva que se
-- carga nace sin poder atender nada, y el dueño no tiene forma de saber por qué
-- su empleado nuevo no aparece en la web.
-- ============================================================================

create table if not exists public.service_staff (
  service_id uuid not null references public.services(id) on delete cascade,
  staff_id   uuid not null references public.staff(id)    on delete cascade,
  primary key (service_id, staff_id)
);

comment on table public.service_staff is
  'Qué persona del equipo hace qué servicio. Un servicio SIN filas acá lo hace todo el equipo (ver el encabezado de 0009).';

-- Para resolver rápido "¿quién hace este servicio?" (la consulta de la página
-- pública) y "¿qué hace esta persona?" (la del panel). La PK ya cubre el primer
-- caso; este índice cubre el segundo.
create index if not exists service_staff_by_staff
  on public.service_staff (staff_id);

-- ---------------------------------------------------------------------------
-- Permisos. Mismo criterio que 0007: el GRANT habilita a intentar, la policy
-- decide qué filas. `anon` afuera — al público se llega sólo por las RPC.
-- ---------------------------------------------------------------------------
alter table public.service_staff enable row level security;

grant select, insert, update, delete on public.service_staff to authenticated;
revoke all on public.service_staff from anon;

drop policy if exists service_staff_owner_all on public.service_staff;
create policy service_staff_owner_all on public.service_staff
  for all
  using (
    exists (
      select 1
      from public.services s
      join public.businesses b on b.id = s.business_id
      where s.id = service_staff.service_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.services s
      join public.businesses b on b.id = s.business_id
      where s.id = service_staff.service_id
        and b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- La página pública lee los servicios por public_shop_info, así que la relación
-- tiene que viajar ahí: sin esto el navegador no tiene con qué filtrar el
-- selector de personas.
--
-- `staff_ids` viene vacío cuando el servicio lo hace todo el equipo. El front
-- interpreta "[] = todos", igual que la base.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_shop_info(shop_slug text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'name', b.name,
    'slug', b.slug,
    'slot_minutes', b.slot_minutes,
    'min_notice_min', b.min_notice_min,
    'business_type', b.business_type,
    'services', (
      select coalesce(json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'icon', s.icon,
        'duration_min', s.duration_min, 'price', s.price,
        'staff_ids', coalesce((
          select json_agg(ss.staff_id)
          from service_staff ss
          join staff st on st.id = ss.staff_id and st.active
          where ss.service_id = s.id
        ), '[]'::json)
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

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Para verificar después de aplicar, logueado como dueño:
--   select * from public.service_staff;                  -- responde, no 42501
--   select public.public_shop_info('barberia-samuel');   -- cada servicio trae staff_ids
-- ---------------------------------------------------------------------------
