-- ════════════════════════════════════════════════════════════════════
-- FOTO DEL SCHEMA — generada por scripts/introspect.mjs
-- 2026-08-26T21:36:12.824Z
--
-- NO se corre. Es documentación: el schema base de Turnito vive en
-- Supabase y no estaba versionado. Regenerá con:
--     node scripts/introspect.mjs
-- ════════════════════════════════════════════════════════════════════

-- ══════════════════ FUNCIONES (16) ══════════════════

CREATE OR REPLACE FUNCTION public.admin_acceso(negocio uuid, dias integer DEFAULT 0, estado text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.admin_negocios()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.admin_resumen()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.cambiar_slug(nuevo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  mi_negocio uuid;
  actual     text;
begin
  select id, slug into mi_negocio, actual
    from businesses
   where owner_id = auth.uid();

  if mi_negocio is null then
    return json_build_object('ok', false, 'error', 'SIN_NEGOCIO');
  end if;

  if nuevo = actual then
    return json_build_object('ok', true, 'slug', actual);
  end if;

  if nuevo is null or nuevo !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(nuevo) > 30 then
    return json_build_object('ok', false, 'error', 'FORMATO');
  end if;

  if nuevo in ('api', 'legales', 'login', 'onboarding', 'panel', 't', 'admin', 'www') then
    return json_build_object('ok', false, 'error', 'RESERVADO');
  end if;

  -- Ocupado por otro local, o redirigiendo al local de otro. Las dos cosas
  -- importan: si tomáramos un slug que redirige a otro negocio, los clientes de
  -- ese negocio empezarían a caer acá.
  if exists (select 1 from businesses where slug = nuevo and id <> mi_negocio)
     or exists (select 1 from business_slugs_anteriores
                 where slug = nuevo and business_id <> mi_negocio) then
    return json_build_object('ok', false, 'error', 'OCUPADO');
  end if;

  -- El que deja pasa a redirigir. ON CONFLICT por si ya lo había usado antes.
  insert into business_slugs_anteriores (slug, business_id)
  values (actual, mi_negocio)
  on conflict (slug) do nothing;

  -- Si vuelve a uno propio que ya había usado, deja de ser una redirección.
  delete from business_slugs_anteriores
   where slug = nuevo and business_id = mi_negocio;

  update businesses set slug = nuevo where id = mi_negocio;

  return json_build_object('ok', true, 'slug', nuevo);
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_booking_caps()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.public_appointment_by_token(t text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.public_busy_slots(shop_slug text, on_date date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(json_agg(json_build_object(
    'time', a.time, 'duration_min', s.duration_min
  )), '[]')
  from appointments a
  join businesses b on b.id = a.business_id
  join services s on s.id = a.service_id
  where b.slug = shop_slug
    and a.date = on_date
    and a.status in ('confirmed','done');
$function$


CREATE OR REPLACE FUNCTION public.public_busy_slots_v2(shop_slug text, on_date date)
 RETURNS TABLE("time" time without time zone, duration_min integer, barber_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v."time", v.duration_min, v.staff_id
  from public.public_busy_slots_v3(shop_slug, on_date) v;
$function$


CREATE OR REPLACE FUNCTION public.public_busy_slots_v3(shop_slug text, on_date date)
 RETURNS TABLE("time" time without time zone, duration_min integer, staff_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a."time",
         coalesce(s.duration_min, b.slot_minutes) as duration_min,
         a.staff_id
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  left join public.services s on s.id = a.service_id
  where b.slug = shop_slug
    and a.date = on_date
    and a.status in ('confirmed', 'done');
$function$


CREATE OR REPLACE FUNCTION public.public_cancel_by_token(t text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$


CREATE OR REPLACE FUNCTION public.public_shop_barbers(shop_slug text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.public_shop_staff(shop_slug);
$function$


CREATE OR REPLACE FUNCTION public.public_shop_info(shop_slug text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'name', b.name,
    'slug', b.slug,
    'whatsapp', b.whatsapp,
    'slot_minutes', b.slot_minutes,
    'min_notice_min', b.min_notice_min,
    'business_type', b.business_type,
    'services', (
      select coalesce(json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'icon', s.icon,
        'duration_min', s.duration_min, 'price', s.price,
        'booking_mode', s.booking_mode,
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
$function$


CREATE OR REPLACE FUNCTION public.public_shop_staff(shop_slug text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    json_agg(
      json_build_object(
        'id', st.id,
        'name', st.name,
        'whatsapp', st.whatsapp,
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
$function$


CREATE OR REPLACE FUNCTION public.public_slug_actual(viejo text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.slug
  from business_slugs_anteriores a
  join businesses b on b.id = a.business_id
  where a.slug = viejo
    and b.subscription_status in ('trial', 'active');
$function$


CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION public.stats_negocio(desde date, hasta date)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$



-- ══════════════════ CONSTRAINTS (35) ══════════════════

alter table appointments add constraint appointments_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table appointments add constraint appointments_pkey PRIMARY KEY (id);

alter table appointments add constraint appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);

alter table appointments add constraint appointments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL;

alter table appointments add constraint appointments_token_key UNIQUE (token);

alter table appointments add constraint valid_status CHECK ((status = ANY (ARRAY['confirmed'::text, 'done'::text, 'no_show'::text, 'cancelled_by_client'::text, 'cancelled_by_shop'::text])));

alter table booking_attempts add constraint booking_attempts_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table booking_attempts add constraint booking_attempts_pkey PRIMARY KEY (id);

alter table business_slugs_anteriores add constraint business_slugs_anteriores_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table business_slugs_anteriores add constraint business_slugs_anteriores_pkey PRIMARY KEY (slug);

alter table businesses add constraint businesses_business_type_check CHECK ((business_type = ANY (ARRAY['barberia'::text, 'unas'::text, 'pestanas'::text, 'tatuajes'::text, 'peluqueria'::text, 'otro'::text])));

alter table businesses add constraint businesses_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table businesses add constraint businesses_pkey PRIMARY KEY (id);

alter table businesses add constraint businesses_slug_key UNIQUE (slug);

alter table businesses add constraint slug_format CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text));

alter table businesses add constraint slug_no_reservado CHECK ((slug <> ALL (ARRAY['api'::text, 'legales'::text, 'login'::text, 'onboarding'::text, 'panel'::text, 't'::text, 'admin'::text, 'www'::text])));

alter table closed_dates add constraint closed_dates_business_id_date_key UNIQUE (business_id, date);

alter table closed_dates add constraint closed_dates_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table closed_dates add constraint closed_dates_pkey PRIMARY KEY (id);

alter table opening_hours add constraint opening_hours_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table opening_hours add constraint opening_hours_pkey PRIMARY KEY (id);

alter table opening_hours add constraint valid_range CHECK ((closes_at > opens_at));

alter table opening_hours add constraint valid_weekday CHECK (((weekday >= 0) AND (weekday <= 6)));

alter table phone_verifications add constraint phone_verifications_pkey PRIMARY KEY (id);

alter table service_staff add constraint service_staff_pkey PRIMARY KEY (service_id, staff_id);

alter table service_staff add constraint service_staff_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;

alter table service_staff add constraint service_staff_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;

alter table services add constraint services_booking_mode_check CHECK ((booking_mode = ANY (ARRAY['agenda'::text, 'consulta'::text])));

alter table services add constraint services_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table services add constraint services_pkey PRIMARY KEY (id);

alter table staff add constraint staff_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table staff add constraint staff_pkey PRIMARY KEY (id);

alter table staff_absences add constraint staff_absences_pkey PRIMARY KEY (id);

alter table staff_absences add constraint staff_absences_staff_id_date_key UNIQUE (staff_id, date);

alter table staff_absences add constraint staff_absences_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;


-- ══════════════════ INDICES (30) ══════════════════

CREATE INDEX appointments_business_created_idx ON public.appointments USING btree (business_id, created_at DESC);

CREATE INDEX appointments_business_date_idx ON public.appointments USING btree (business_id, date);

CREATE INDEX appointments_by_day ON public.appointments USING btree (business_id, date);

CREATE INDEX appointments_by_phone ON public.appointments USING btree (client_phone);

CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id);

CREATE UNIQUE INDEX appointments_slot_unique ON public.appointments USING btree (business_id, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid), date, "time") WHERE (status = ANY (ARRAY['confirmed'::text, 'done'::text]));

CREATE INDEX appointments_staff_date_idx ON public.appointments USING btree (staff_id, date);

CREATE UNIQUE INDEX appointments_token_key ON public.appointments USING btree (token);

CREATE INDEX booking_attempts_business_time_idx ON public.booking_attempts USING btree (business_id, created_at DESC);

CREATE INDEX booking_attempts_ip_time_idx ON public.booking_attempts USING btree (ip_hash, created_at DESC);

CREATE UNIQUE INDEX booking_attempts_pkey ON public.booking_attempts USING btree (id);

CREATE UNIQUE INDEX business_slugs_anteriores_pkey ON public.business_slugs_anteriores USING btree (slug);

CREATE INDEX slugs_anteriores_por_negocio ON public.business_slugs_anteriores USING btree (business_id);

CREATE UNIQUE INDEX businesses_owner ON public.businesses USING btree (owner_id);

CREATE UNIQUE INDEX businesses_pkey ON public.businesses USING btree (id);

CREATE UNIQUE INDEX businesses_slug_key ON public.businesses USING btree (slug);

CREATE UNIQUE INDEX closed_dates_business_id_date_key ON public.closed_dates USING btree (business_id, date);

CREATE UNIQUE INDEX closed_dates_pkey ON public.closed_dates USING btree (id);

CREATE UNIQUE INDEX opening_hours_pkey ON public.opening_hours USING btree (id);

CREATE UNIQUE INDEX phone_verifications_pkey ON public.phone_verifications USING btree (id);

CREATE INDEX verifications_by_phone ON public.phone_verifications USING btree (phone, created_at DESC);

CREATE INDEX service_staff_by_staff ON public.service_staff USING btree (staff_id);

CREATE UNIQUE INDEX service_staff_pkey ON public.service_staff USING btree (service_id, staff_id);

CREATE INDEX services_by_shop ON public.services USING btree (business_id) WHERE active;

CREATE UNIQUE INDEX services_pkey ON public.services USING btree (id);

CREATE INDEX staff_business_idx ON public.staff USING btree (business_id) WHERE active;

CREATE UNIQUE INDEX staff_pkey ON public.staff USING btree (id);

CREATE INDEX staff_absences_date_idx ON public.staff_absences USING btree (staff_id, date);

CREATE UNIQUE INDEX staff_absences_pkey ON public.staff_absences USING btree (id);

CREATE UNIQUE INDEX staff_absences_staff_id_date_key ON public.staff_absences USING btree (staff_id, date);


-- ══════════════════ RLS POLICIES (9) ══════════════════

-- public.appointments (ALL, roles: public)
  USING (business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.owner_id = auth.uid())))

-- public.business_slugs_anteriores (SELECT, roles: public)
  USING (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = business_slugs_anteriores.business_id) AND (b.owner_id = auth.uid()))))

-- public.businesses (ALL, roles: public)
  USING (owner_id = auth.uid())

-- public.closed_dates (ALL, roles: public)
  USING (business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.owner_id = auth.uid())))

-- public.opening_hours (ALL, roles: public)
  USING (business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.owner_id = auth.uid())))

-- public.service_staff (ALL, roles: public)
  USING (EXISTS ( SELECT 1
   FROM (services s
     JOIN businesses b ON ((b.id = s.business_id)))
  WHERE ((s.id = service_staff.service_id) AND (b.owner_id = auth.uid()))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM (services s
     JOIN businesses b ON ((b.id = s.business_id)))
  WHERE ((s.id = service_staff.service_id) AND (b.owner_id = auth.uid()))))

-- public.services (ALL, roles: public)
  USING (business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.owner_id = auth.uid())))

-- public.staff (ALL, roles: authenticated)
  USING (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = staff.business_id) AND (b.owner_id = auth.uid()))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = staff.business_id) AND (b.owner_id = auth.uid()))))

-- public.staff_absences (ALL, roles: authenticated)
  USING (EXISTS ( SELECT 1
   FROM (staff br
     JOIN businesses b ON ((b.id = br.business_id)))
  WHERE ((br.id = staff_absences.staff_id) AND (b.owner_id = auth.uid()))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM (staff br
     JOIN businesses b ON ((b.id = br.business_id)))
  WHERE ((br.id = staff_absences.staff_id) AND (b.owner_id = auth.uid()))))


-- ══════════════════ TRIGGERS (1) ══════════════════

-- appointments_enforce_caps on appointments: CREATE TRIGGER appointments_enforce_caps BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION enforce_booking_caps()


-- ══════════════════ EVENT TRIGGERS (7) ══════════════════

-- ensure_rls: ddl_command_end O -> rls_auto_enable()

-- issue_graphql_placeholder: sql_drop O -> set_graphql_placeholder()

-- issue_pg_cron_access: ddl_command_end O -> grant_pg_cron_access()

-- issue_pg_graphql_access: ddl_command_end O -> grant_pg_graphql_access()

-- issue_pg_net_access: ddl_command_end O -> grant_pg_net_access()

-- pgrst_ddl_watch: ddl_command_end O -> pgrst_ddl_watch()

-- pgrst_drop_watch: sql_drop O -> pgrst_drop_watch()


-- ══════════════════ COLUMNAS (81) ══════════════════

-- appointments.id uuid NOT NULL DEFAULT gen_random_uuid()

-- appointments.business_id uuid NOT NULL

-- appointments.service_id uuid NOT NULL

-- appointments.client_name text NOT NULL

-- appointments.client_phone text NOT NULL

-- appointments.date date NOT NULL

-- appointments.time time without time zone NOT NULL

-- appointments.token text NOT NULL DEFAULT encode(gen_random_bytes(9), 'hex'::text)

-- appointments.status text NOT NULL DEFAULT 'confirmed'::text

-- appointments.created_at timestamp with time zone NOT NULL DEFAULT now()

-- appointments.cancelled_at timestamp with time zone

-- appointments.staff_id uuid

-- appointments.client_email text

-- appointments.price integer

-- appointments.service_name text

-- booking_attempts.id bigint NOT NULL

-- booking_attempts.ip_hash text NOT NULL

-- booking_attempts.business_id uuid

-- booking_attempts.outcome text NOT NULL

-- booking_attempts.created_at timestamp with time zone NOT NULL DEFAULT now()

-- business_slugs_anteriores.slug text NOT NULL

-- business_slugs_anteriores.business_id uuid NOT NULL

-- business_slugs_anteriores.created_at timestamp with time zone NOT NULL DEFAULT now()

-- businesses.id uuid NOT NULL DEFAULT gen_random_uuid()

-- businesses.owner_id uuid NOT NULL

-- businesses.name text NOT NULL

-- businesses.slug text NOT NULL

-- businesses.whatsapp text NOT NULL

-- businesses.slot_minutes integer NOT NULL DEFAULT 30

-- businesses.timezone text NOT NULL DEFAULT 'America/Argentina/Cordoba'::text

-- businesses.trial_ends_at timestamp with time zone NOT NULL DEFAULT (now() + '30 days'::interval)

-- businesses.subscription_status text NOT NULL DEFAULT 'trial'::text

-- businesses.mp_subscription_id text

-- businesses.created_at timestamp with time zone NOT NULL DEFAULT now()

-- businesses.min_notice_min integer NOT NULL DEFAULT 60

-- businesses.cancel_limit_min integer NOT NULL DEFAULT 60

-- businesses.business_type text DEFAULT 'otro'::text

-- businesses.daily_booking_cap integer NOT NULL DEFAULT 40

-- businesses.hourly_booking_cap integer NOT NULL DEFAULT 15

-- closed_dates.id uuid NOT NULL DEFAULT gen_random_uuid()

-- closed_dates.business_id uuid NOT NULL

-- closed_dates.date date NOT NULL

-- closed_dates.reason text

-- closed_dates.from_time time without time zone

-- closed_dates.to_time time without time zone

-- opening_hours.id uuid NOT NULL DEFAULT gen_random_uuid()

-- opening_hours.business_id uuid NOT NULL

-- opening_hours.weekday integer NOT NULL

-- opening_hours.opens_at time without time zone NOT NULL

-- opening_hours.closes_at time without time zone NOT NULL

-- phone_verifications.id uuid NOT NULL DEFAULT gen_random_uuid()

-- phone_verifications.phone text NOT NULL

-- phone_verifications.code text NOT NULL

-- phone_verifications.expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:10:00'::interval)

-- phone_verifications.attempts integer NOT NULL DEFAULT 0

-- phone_verifications.verified boolean NOT NULL DEFAULT false

-- phone_verifications.created_at timestamp with time zone NOT NULL DEFAULT now()

-- service_staff.service_id uuid NOT NULL

-- service_staff.staff_id uuid NOT NULL

-- services.id uuid NOT NULL DEFAULT gen_random_uuid()

-- services.business_id uuid NOT NULL

-- services.name text NOT NULL

-- services.icon text DEFAULT '✂️'::text

-- services.duration_min integer NOT NULL DEFAULT 30

-- services.price integer NOT NULL

-- services.active boolean NOT NULL DEFAULT true

-- services.sort_order integer NOT NULL DEFAULT 0

-- services.created_at timestamp with time zone NOT NULL DEFAULT now()

-- services.booking_mode text NOT NULL DEFAULT 'agenda'::text

-- staff.id uuid NOT NULL DEFAULT gen_random_uuid()

-- staff.business_id uuid NOT NULL

-- staff.name text NOT NULL

-- staff.active boolean NOT NULL DEFAULT true

-- staff.sort_order integer NOT NULL DEFAULT 0

-- staff.created_at timestamp with time zone NOT NULL DEFAULT now()

-- staff.whatsapp text

-- staff_absences.id uuid NOT NULL DEFAULT gen_random_uuid()

-- staff_absences.staff_id uuid NOT NULL

-- staff_absences.date date NOT NULL

-- staff_absences.reason text

-- staff_absences.created_at timestamp with time zone NOT NULL DEFAULT now()
