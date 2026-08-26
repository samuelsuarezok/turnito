-- ============================================================================
-- Panel de la plataforma: quién usa Turnito y hasta cuándo tiene acceso
-- Fecha: 2026-08-26
-- Correr en: npm run db:migrate supabase/migrations/0013_admin_plataforma.sql
-- (después de 0012_cambiar_slug.sql)
--
-- QUÉ RESUELVE
--
-- Hasta ahora no había forma de contestar "¿cuántos usan Turnito?" sin abrir el
-- SQL Editor de Supabase, y menos todavía de ver a quién se le está por vencer
-- la prueba. Esto pone esos números detrás de /admin.
--
-- POR QUÉ SÓLO service_role
--
-- Estas funciones ven TODOS los negocios y el mail de todos los dueños: son lo
-- contrario de la RLS que protege al resto de la app. Por eso van con el EXECUTE
-- revocado de `public` (que es el default de Postgres al crear una función) y
-- concedido únicamente a `service_role`.
--
-- La consecuencia práctica: NO se pueden llamar desde el browser. La clave de
-- service role sólo vive en el servidor, así que /admin es la primera pantalla
-- del proyecto que renderiza en el server. Quién es admin se decide ahí, con
-- ADMIN_EMAILS — ver lib/admin.ts.
--
-- SECURITY DEFINER es obligatorio acá: `auth.users` no está expuesta por
-- PostgREST y no la alcanza ningún rol de la API. La única forma de contar
-- cuentas creadas (que NO es lo mismo que negocios: alguien puede registrarse y
-- abandonar el onboarding) es una función que corra con los permisos de su
-- dueño, que es quien corre esta migración.
--
-- QUÉ SIGNIFICA CADA ESTADO
--
--   trial   → en prueba. Opera normal.
--   active  → pagando. Opera normal.
--   cualquier otra cosa → el local queda invisible: public_shop_info() y
--             public_shop_staff() filtran por `in ('trial','active')` y
--             /api/book rechaza la reserva. Escribimos 'vencido'.
--
-- OJO: hoy NADA corta el acceso solo. Un negocio con trial_ends_at en el pasado
-- sigue operando mientras el estado diga 'trial' — el filtro mira el estado, no
-- la fecha. Es a propósito (nadie quiere apagarle el local a un cliente que pagó
-- y todavía no lo registramos), y por eso el panel muestra "prueba vencida"
-- como una fila que hay que atender a mano, no como un hecho consumado.
-- ============================================================================

-- trial_ends_at nació como "fin de la prueba" y en los hechos es "hasta cuándo
-- tiene acceso": cuando alguien paga, se le suman días a la misma fecha. Queda
-- documentado en la base para que el nombre no confunda al que lo lea después.
comment on column public.businesses.trial_ends_at is
  'Hasta cuándo tiene acceso, sea prueba o mes pagado. subscription_status dice cuál de las dos. Se extiende con admin_acceso().';


-- ---------------------------------------------------------------------------
-- 1. Los números de arriba
-- ---------------------------------------------------------------------------
-- Todo en una sola llamada y en un JSON chico: son doce contadores y no tiene
-- sentido pagar doce round-trips ni bajarse las tablas para contarlas en JS.
create or replace function public.admin_resumen()
returns json
language sql
stable
security definer
set search_path = public
as $function$
  select json_build_object(
    -- CUENTAS != NEGOCIOS. La diferencia entre las dos es el embudo del
    -- onboarding: cuánta gente se registra y no llega a publicar su local.
    'cuentas', json_build_object(
      'total',       (select count(*) from auth.users),
      'ultimos_7',   (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'ultimos_30',  (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'sin_negocio', (select count(*) from auth.users u
                       where not exists (select 1 from businesses b where b.owner_id = u.id))
    ),

    'negocios', json_build_object(
      'total',          (select count(*) from businesses),
      'ultimos_7',      (select count(*) from businesses where created_at > now() - interval '7 days'),
      'ultimos_30',     (select count(*) from businesses where created_at > now() - interval '30 days'),
      'en_prueba',      (select count(*) from businesses
                          where subscription_status = 'trial' and trial_ends_at >= now()),
      -- La fila que hay que mirar todos los días: siguen operando gratis.
      'prueba_vencida', (select count(*) from businesses
                          where subscription_status = 'trial' and trial_ends_at < now()),
      'pagando',        (select count(*) from businesses where subscription_status = 'active'),
      'cortados',       (select count(*) from businesses
                          where subscription_status not in ('trial', 'active')),
      'vencen_en_7',    (select count(*) from businesses
                          where subscription_status in ('trial', 'active')
                            and trial_ends_at between now() and now() + interval '7 days')
    ),

    'uso', json_build_object(
      'turnos',            (select count(*) from appointments),
      'turnos_7',          (select count(*) from appointments where created_at > now() - interval '7 days'),
      'turnos_30',         (select count(*) from appointments where created_at > now() - interval '30 days'),
      -- Un negocio "vivo" es uno que recibió al menos un turno en el mes. Es el
      -- número honesto de uso: los otros existen en la tabla y nada más.
      'locales_vivos_30',  (select count(distinct business_id) from appointments
                             where created_at > now() - interval '30 days'),
      -- Personas que reservaron alguna vez. El teléfono es la identidad del
      -- cliente final: no tiene cuenta, y es lo único que siempre está.
      'personas',          (select count(distinct client_phone) from appointments),
      'personas_30',       (select count(distinct client_phone) from appointments
                             where created_at > now() - interval '30 days')
    ),

    -- Las cuentas que se registraron y nunca publicaron un local. Se listan (no
    -- sólo se cuentan) porque son a quienes tiene sentido escribirles.
    'sin_negocio', (
      select coalesce(json_agg(json_build_object(
        'email', u.email, 'creada', u.created_at
      ) order by u.created_at desc), '[]'::json)
      from (
        select u2.email, u2.created_at
        from auth.users u2
        where not exists (select 1 from businesses b where b.owner_id = u2.id)
        order by u2.created_at desc
        limit 20
      ) u
    )
  );
$function$;

comment on function public.admin_resumen() is
  'Contadores de toda la plataforma para /admin. Sólo service_role: ve todos los negocios y todas las cuentas.';


-- ---------------------------------------------------------------------------
-- 2. Un renglón por negocio
-- ---------------------------------------------------------------------------
-- Se devuelve la lista entera, sin paginar: con el tamaño de hoy son unas
-- decenas de filas, y poder buscar y filtrar sobre todo en el cliente vale más
-- que ahorrar unos KB. Cuando sean miles, acá va un `limit` y un `offset`.
create or replace function public.admin_negocios()
returns json
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(json_agg(x order by x.creado desc), '[]'::json)
  from (
    select
      b.id,
      b.name                as nombre,
      b.slug,
      b.business_type       as rubro,
      b.whatsapp,
      b.subscription_status as estado,
      b.created_at          as creado,
      b.trial_ends_at       as vence,
      -- Días ENTEROS que le quedan. Negativo = venció hace tantos días.
      -- Se calcula en la base a propósito: si lo hiciera el navegador, el
      -- número dependería del reloj de la máquina del que mira el panel.
      floor(extract(epoch from (b.trial_ends_at - now())) / 86400)::int as dias,
      floor(extract(epoch from (now() - b.created_at))    / 86400)::int as antiguedad,
      u.email                                                          as email,
      u.last_sign_in_at                                                as ultimo_ingreso,
      (select count(*) from staff s
        where s.business_id = b.id and s.active)                       as equipo,
      (select count(*) from appointments a
        where a.business_id = b.id)                                    as turnos,
      (select count(*) from appointments a
        where a.business_id = b.id
          and a.created_at > now() - interval '30 days')               as turnos_30,
      (select max(a.created_at) from appointments a
        where a.business_id = b.id)                                    as ultimo_turno
    from businesses b
    -- LEFT JOIN y no INNER: si alguna vez se borra un usuario de auth, el
    -- negocio tiene que seguir apareciendo en el panel, sin mail pero visible.
    left join auth.users u on u.id = b.owner_id
  ) x;
$function$;

comment on function public.admin_negocios() is
  'Un renglón por negocio con dueño, vencimiento y uso, para /admin. Sólo service_role.';


-- ---------------------------------------------------------------------------
-- 3. Mover el vencimiento y el estado
-- ---------------------------------------------------------------------------
-- Una sola función para los cuatro movimientos reales (extender la prueba,
-- registrar un cobro, cortar, reactivar) porque los cuatro son la misma
-- operación: correr la fecha, cambiar el estado, o las dos cosas juntas.
--
-- `greatest(trial_ends_at, now())` es la parte que importa: si la prueba ya
-- venció, "+30" tiene que ser 30 días desde HOY, no 30 días desde una fecha
-- pasada (que lo dejaría vencido igual). Y si todavía no venció, los días se
-- SUMAN a lo que le quedaba, que es lo que corresponde cuando alguien paga
-- antes de tiempo.
create or replace function public.admin_acceso(
  negocio uuid,
  dias    int  default 0,
  estado  text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  fila record;
begin
  -- 'vencido' es el corte. Cualquier otro valor fuera de esta lista dejaría al
  -- local invisible con un estado que después nadie sabe interpretar.
  if estado is not null and estado not in ('trial', 'active', 'vencido') then
    return json_build_object('ok', false, 'error', 'ESTADO_INVALIDO');
  end if;

  -- Un año para cualquier lado. No es una regla de negocio: es que un 3650
  -- tipeado de más no debería poder regalar diez años de servicio.
  if dias < -365 or dias > 365 then
    return json_build_object('ok', false, 'error', 'DIAS_FUERA_DE_RANGO');
  end if;

  update businesses b
     set trial_ends_at = case
           when dias = 0 then b.trial_ends_at
           else greatest(b.trial_ends_at, now()) + make_interval(days => dias)
         end,
         subscription_status = coalesce(estado, b.subscription_status)
   where b.id = negocio
   returning b.slug, b.subscription_status, b.trial_ends_at
   into fila;

  if not found then
    return json_build_object('ok', false, 'error', 'NO_EXISTE');
  end if;

  return json_build_object(
    'ok', true,
    'slug', fila.slug,
    'estado', fila.subscription_status,
    'vence', fila.trial_ends_at
  );
end;
$function$;

comment on function public.admin_acceso(uuid, int, text) is
  'Corre el vencimiento y/o cambia el estado de un negocio. Sólo service_role: es la palanca de cobro de la plataforma.';


-- ---------------------------------------------------------------------------
-- 4. Permisos
-- ---------------------------------------------------------------------------
-- Postgres le da EXECUTE a `public` a TODA función nueva. Sin estos revokes,
-- cualquier visitante con la anon key podría llamar admin_negocios() y bajarse
-- el mail de todos los dueños. El revoke va primero y el grant después.
revoke execute on function public.admin_resumen()               from public;
revoke execute on function public.admin_negocios()              from public;
revoke execute on function public.admin_acceso(uuid, int, text) from public;

revoke execute on function public.admin_resumen()               from anon, authenticated;
revoke execute on function public.admin_negocios()              from anon, authenticated;
revoke execute on function public.admin_acceso(uuid, int, text) from anon, authenticated;

grant execute on function public.admin_resumen()                to service_role;
grant execute on function public.admin_negocios()               to service_role;
grant execute on function public.admin_acceso(uuid, int, text)  to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Para verificar después de aplicar:
--
--   select public.admin_resumen();     -- en el SQL Editor (corre como postgres)
--
-- Y que NO se pueda desde el browser, con la anon key:
--
--   curl -s "$URL/rest/v1/rpc/admin_negocios" -X POST \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--        -H "Content-Type: application/json" -d '{}'
--   → tiene que devolver 401/403, nunca la lista.
-- ---------------------------------------------------------------------------
