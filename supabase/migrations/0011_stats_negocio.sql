-- ============================================================================
-- Analíticas por rango de fechas
-- Fecha: 2026-08-09
-- Correr en: npm run db:migrate supabase/migrations/0011_stats_negocio.sql
-- (después de 0010_servicios_por_consulta.sql)
--
-- POR QUÉ EN LA BASE Y NO EN EL CLIENTE
--
-- Agregar por mes desde el navegador obliga a bajarse todos los turnos del
-- período para sumarlos en JavaScript. Con un local chico y un mes es
-- tolerable; con un año, o con un local que labura mucho, es traer miles de
-- filas para mostrar seis números. Postgres agrupa donde están los datos.
--
-- POR QUÉ SECURITY INVOKER Y NO DEFINER
--
-- Al revés que las funciones public_* (que exponen datos a `anon` y por eso
-- tienen que ser DEFINER), esta la llama el dueño logueado. Corriendo como
-- INVOKER, la policy de RLS de `appointments` se aplica sola:
--
--     business_id in (select id from businesses where owner_id = auth.uid())
--
-- O sea que no hace falta recibir el business_id por parámetro, y no existe la
-- posibilidad de pedir los números de otro local: la base no se los va a dar.
--
-- LA PLATA SALE DE appointments.price, NUNCA DE services.price
--
-- Es el precio congelado al reservar (0008). Si el negocio sube la lista, los
-- meses cerrados siguen valiendo lo que valían.
-- ============================================================================

create or replace function public.stats_negocio(desde date, hasta date)
returns json
language sql
stable
security invoker
set search_path = public
as $function$
  with base as (
    select a.date, a.status, a.price, a.service_id, a.staff_id, a.service_name
    from appointments a
    where a.date between desde and hasta
  )
  select json_build_object(
    'desde', desde,
    'hasta', hasta,

    'totales', (
      select json_build_object(
        'hechos',          count(*) filter (where status = 'done'),
        'pendientes',      count(*) filter (where status = 'confirmed'),
        'ausencias',       count(*) filter (where status = 'no_show'),
        'cancelo_cliente', count(*) filter (where status = 'cancelled_by_client'),
        'cancelo_local',   count(*) filter (where status = 'cancelled_by_shop'),
        'facturado',       coalesce(sum(price) filter (where status = 'done'), 0),
        -- Turnos atendidos sin precio: son los anteriores a la 0008. Se
        -- informan para que el total no mienta por omisión.
        'sin_precio',      count(*) filter (where status = 'done' and price is null)
      )
      from base
    ),

    -- Por servicio. Se agrupa por el nombre CONGELADO en el turno; si es null
    -- (turno viejo) se cae al nombre actual del servicio.
    'por_servicio', (
      select coalesce(json_agg(json_build_object(
        'nombre', x.nombre, 'hechos', x.hechos, 'facturado', x.facturado
      ) order by x.hechos desc, x.nombre), '[]'::json)
      from (
        select coalesce(b.service_name, s.name, 'Sin servicio') as nombre,
               count(*) filter (where b.status = 'done')                       as hechos,
               coalesce(sum(b.price) filter (where b.status = 'done'), 0)      as facturado
        from base b
        left join services s on s.id = b.service_id
        group by 1
        having count(*) filter (where b.status = 'done') > 0
      ) x
    ),

    -- Por persona. `staff_id` null = turnos de cuando el local tenía una sola
    -- agenda; se muestran aparte en vez de repartirlos a dedo.
    'por_persona', (
      select coalesce(json_agg(json_build_object(
        'nombre', x.nombre, 'hechos', x.hechos,
        'ausencias', x.ausencias, 'facturado', x.facturado
      ) order by x.facturado desc, x.nombre), '[]'::json)
      from (
        select coalesce(st.name, 'Sin asignar') as nombre,
               count(*) filter (where b.status = 'done')                  as hechos,
               count(*) filter (where b.status = 'no_show')               as ausencias,
               coalesce(sum(b.price) filter (where b.status = 'done'), 0) as facturado
        from base b
        left join staff st on st.id = b.staff_id
        group by 1
        having count(*) filter (where b.status in ('done', 'no_show')) > 0
      ) x
    ),

    -- Serie diaria completa, con los días en cero incluidos: un gráfico con
    -- agujeros miente sobre el ritmo del local.
    'por_dia', (
      select coalesce(json_agg(json_build_object(
        'fecha', g.dia::date,
        'hechos', (select count(*) from base b where b.date = g.dia::date and b.status = 'done'),
        'facturado', (select coalesce(sum(b.price), 0) from base b where b.date = g.dia::date and b.status = 'done')
      ) order by g.dia), '[]'::json)
      from generate_series(desde::timestamp, hasta::timestamp, interval '1 day') g(dia)
    )
  );
$function$;

comment on function public.stats_negocio(date, date) is
  'Números del negocio del usuario logueado entre dos fechas. Corre como INVOKER: la RLS de appointments limita el resultado a su propio local. Pensada para rangos de hasta un año.';

grant execute on function public.stats_negocio(date, date) to authenticated;
revoke execute on function public.stats_negocio(date, date) from anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Para verificar después de aplicar, logueado como dueño:
--   select public.stats_negocio(current_date - 30, current_date);
-- Como anon debe fallar por permisos.
-- ---------------------------------------------------------------------------
