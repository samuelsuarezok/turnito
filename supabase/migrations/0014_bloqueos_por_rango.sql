-- ============================================================================
-- Bloquear UN HORARIO, no el día entero
-- Fecha: 2026-11-06
-- Correr en: npm run db:migrate supabase/migrations/0014_bloqueos_por_rango.sql
-- (después de 0013_admin_plataforma.sql)
--
-- EL REPORTE
--
-- Un local avisó que "al querer bloquear un horario se le bloqueaba el día y no
-- dejaba sacar turnos". No dijo desde dónde lo hizo, así que se revisaron los
-- tres caminos y los tres tenían el mismo agujero: no se puede bloquear un rato.
--
--   1. Las AUSENCIAS del equipo no tienen hora. `staff_absences` era
--      (staff_id, date): bloquear a alguien es bloquearle el día completo,
--      siempre. Si el dueño quería sacar a un barbero de 14 a 17, la única
--      herramienta disponible le cerraba el día — y en un local donde una sola
--      persona toma todos los turnos, eso es cerrar el local. Es el que mejor
--      explica el reporte, palabra por palabra.
--
--   2. Un solo bloqueo por día. El UNIQUE (business_id, date) de `closed_dates`
--      impedía cargar dos franjas la misma fecha: bloqueado el mediodía, el
--      intento de bloquear también la tarde moría con "Esa fecha ya está
--      bloqueada", y el camino que queda es marcar el día entero.
--
--   3. Nadie avisa el impacto. El 9/9 un local bloqueó 10:30–19:30 sobre un
--      miércoles de horario partido y le quedó UN turno disponible en todo el
--      día. La pantalla no se lo dijo en ningún momento. (Eso se arregla en la
--      UI, no acá.)
--
-- QUÉ HACE ESTA MIGRACIÓN
--
-- Les da hora a los dos tipos de bloqueo y deja cargar varias franjas por día.
--
-- ES RETROCOMPATIBLE A PROPÓSITO: las columnas nuevas son NULL, y NULL sigue
-- significando exactamente lo que significaba hasta hoy — día completo. Las 2
-- ausencias y los 12 bloqueos que ya existen no cambian de comportamiento.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Las ausencias pasan a tener hora
-- ---------------------------------------------------------------------------
alter table public.staff_absences
  add column if not exists from_time time,
  add column if not exists to_time   time;

comment on column public.staff_absences.from_time is
  'Desde qué hora no está. NULL = el día completo, que es como funcionaba antes de la 0014.';

-- Media franja no existe: o están las dos horas, o no está ninguna. Sin esto,
-- una fila con from_time y sin to_time se leería como día completo en un lado
-- y como rango roto en el otro.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_absences_rango_valido') then
    alter table public.staff_absences
      add constraint staff_absences_rango_valido
      check (
        (from_time is null and to_time is null)
        or (from_time is not null and to_time is not null and from_time < to_time)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Varias franjas por día, sin permitir la misma dos veces
-- ---------------------------------------------------------------------------
-- El UNIQUE viejo era (staff_id, date): una fila por persona y día, y punto.
-- El nuevo suma `from_time`, así que entran todas las franjas que el local
-- necesite el mismo día.
--
-- NULLS NOT DISTINCT es la parte que importa y es lo que hace Postgres 15+.
-- Por default Postgres considera que dos NULL son distintos, así que un UNIQUE
-- común habría dejado cargar el MISMO día completo veinte veces. Con NULLS NOT
-- DISTINCT, los dos NULL cuentan como iguales: un solo día completo por
-- persona y fecha, y además las franjas que quiera.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'staff_absences_staff_id_date_key') then
    alter table public.staff_absences drop constraint staff_absences_staff_id_date_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_absences_franja_key') then
    alter table public.staff_absences
      add constraint staff_absences_franja_key
      unique nulls not distinct (staff_id, date, from_time);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Lo mismo para los días cerrados del negocio
-- ---------------------------------------------------------------------------
-- `closed_dates` ya tenía from_time/to_time; lo que no tenía era permiso para
-- más de una franja por fecha.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'closed_dates_business_id_date_key') then
    alter table public.closed_dates drop constraint closed_dates_business_id_date_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'closed_dates_franja_key') then
    alter table public.closed_dates
      add constraint closed_dates_franja_key
      unique nulls not distinct (business_id, date, from_time);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'closed_dates_rango_valido') then
    alter table public.closed_dates
      add constraint closed_dates_rango_valido
      check (
        (from_time is null and to_time is null)
        or (from_time is not null and to_time is not null and from_time < to_time)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. La pantalla pública tiene que enterarse de las horas
-- ---------------------------------------------------------------------------
-- `absences` SE MANTIENE y ahora lista sólo los días COMPLETOS. No es un
-- descuido: es lo que hace que la migración se pueda aplicar sin coordinar con
-- el deploy. El código viejo lee ese campo para tachar días enteros en el
-- calendario, y una ausencia parcial no es un día entero — tacharlo sería
-- mentir. Mientras el deploy nuevo no esté, una ausencia parcial simplemente
-- todavía no se aplica; nunca se bloquea de más.
--
-- `ausencias` es el campo nuevo, con las horas, y es el que mira el código de
-- ahora en adelante.
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
        -- Compat con el código anterior a la 0014: sólo días completos.
        'absences', coalesce((
          select json_agg(a.date order by a.date)
          from public.staff_absences a
          where a.staff_id = st.id and a.date >= current_date
            and a.from_time is null
        ), '[]'::json),
        -- Lo que usa el código nuevo: cada ausencia con su franja (from/to en
        -- null = día completo).
        'ausencias', coalesce((
          select json_agg(json_build_object(
            'date', a.date, 'from_time', a.from_time, 'to_time', a.to_time
          ) order by a.date, a.from_time nulls first)
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

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Para verificar después de aplicar:
--
--   -- una ausencia parcial y otra de día completo, misma persona y fecha:
--   select public.public_shop_staff('original-style');
--
--   -- el mismo día completo dos veces tiene que fallar (23505):
--   insert into staff_absences (staff_id, date) values ('<id>', '2027-01-01');
--   insert into staff_absences (staff_id, date) values ('<id>', '2027-01-01');
--
--   -- dos franjas distintas el mismo día tienen que entrar las dos:
--   insert into staff_absences (staff_id, date, from_time, to_time)
--   values ('<id>', '2027-01-02', '10:00', '12:00'), ('<id>', '2027-01-02', '18:00', '19:00');
--
-- ROLLBACK (si hiciera falta volver atrás):
--   alter table staff_absences drop constraint staff_absences_franja_key;
--   alter table staff_absences add constraint staff_absences_staff_id_date_key unique (staff_id, date);
--   alter table staff_absences drop column from_time, drop column to_time;
--   -- idem closed_dates, y recrear public_shop_staff desde la 0009.
--   -- Ojo: el rollback FALLA si ya se cargaron dos franjas del mismo día.
-- ---------------------------------------------------------------------------
