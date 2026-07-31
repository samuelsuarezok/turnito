-- ════════════════════════════════════════════════════════════════════
-- FOTO DEL SCHEMA — generada por scripts/introspect.mjs
-- 2026-07-31T16:34:40.409Z
--
-- NO se corre. Es documentación: el schema base de Turnito vive en
-- Supabase y no estaba versionado. Regenerá con:
--     node scripts/introspect.mjs
-- ════════════════════════════════════════════════════════════════════

-- ══════════════════ FUNCIONES (7) ══════════════════

CREATE OR REPLACE FUNCTION public.public_appointment_by_token(t text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
  join barbershops b on b.id = a.barbershop_id
  join services s on s.id = a.service_id
  where a.token = t;
$function$


CREATE OR REPLACE FUNCTION public.public_busy_slots(shop_slug text, on_date date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select coalesce(json_agg(json_build_object(
    'time', a.time, 'duration_min', s.duration_min
  )), '[]')
  from appointments a
  join barbershops b on b.id = a.barbershop_id
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
  select a."time",
         coalesce(s.duration_min, b.slot_minutes) as duration_min,
         a.barber_id
  from public.appointments a
  join public.barbershops b on b.id = a.barbershop_id
  left join public.services s on s.id = a.service_id
  where b.slug = shop_slug
    and a.date = on_date
    and a.status in ('confirmed', 'done');
$function$


CREATE OR REPLACE FUNCTION public.public_cancel_by_token(t text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare ok boolean;
begin
  update appointments a
  set status = 'cancelled_by_client', cancelled_at = now()
  from barbershops b
  where a.token = t
    and a.status = 'confirmed'
    and b.id = a.barbershop_id
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
$function$


CREATE OR REPLACE FUNCTION public.public_shop_info(shop_slug text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select json_build_object(
    'name', b.name,
    'slug', b.slug,
    'slot_minutes', b.slot_minutes,
    'min_notice_min', b.min_notice_min,
    'services', (
      select coalesce(json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'icon', s.icon,
        'duration_min', s.duration_min, 'price', s.price
      ) order by s.sort_order), '[]')
      from services s where s.barbershop_id = b.id and s.active
    ),
    'hours', (
      select coalesce(json_agg(json_build_object(
        'weekday', h.weekday, 'opens_at', h.opens_at, 'closes_at', h.closes_at
      )), '[]')
      from opening_hours h where h.barbershop_id = b.id
    ),
    'closed', (
      select coalesce(json_agg(json_build_object(
        'date', c.date, 'from_time', c.from_time, 'to_time', c.to_time
      )), '[]')
      from closed_dates c where c.barbershop_id = b.id and c.date >= current_date
    )
  )
  from barbershops b
  where b.slug = shop_slug and b.subscription_status in ('trial','active');
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



-- ══════════════════ CONSTRAINTS (26) ══════════════════

alter table appointments add constraint appointments_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE SET NULL;

alter table appointments add constraint appointments_barbershop_id_fkey FOREIGN KEY (barbershop_id) REFERENCES barbershops(id) ON DELETE CASCADE;

alter table appointments add constraint appointments_pkey PRIMARY KEY (id);

alter table appointments add constraint appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);

alter table appointments add constraint appointments_token_key UNIQUE (token);

alter table appointments add constraint valid_status CHECK ((status = ANY (ARRAY['confirmed'::text, 'done'::text, 'no_show'::text, 'cancelled_by_client'::text, 'cancelled_by_shop'::text])));

alter table barber_absences add constraint barber_absences_barber_id_date_key UNIQUE (barber_id, date);

alter table barber_absences add constraint barber_absences_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE;

alter table barber_absences add constraint barber_absences_pkey PRIMARY KEY (id);

alter table barbers add constraint barbers_barbershop_id_fkey FOREIGN KEY (barbershop_id) REFERENCES barbershops(id) ON DELETE CASCADE;

alter table barbers add constraint barbers_pkey PRIMARY KEY (id);

alter table barbershops add constraint barbershops_business_type_check CHECK ((business_type = ANY (ARRAY['barberia'::text, 'unas'::text, 'pestanas'::text, 'tatuajes'::text, 'peluqueria'::text, 'otro'::text])));

alter table barbershops add constraint barbershops_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table barbershops add constraint barbershops_pkey PRIMARY KEY (id);

alter table barbershops add constraint barbershops_slug_key UNIQUE (slug);

alter table barbershops add constraint slug_format CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text));

alter table closed_dates add constraint closed_dates_barbershop_id_date_key UNIQUE (barbershop_id, date);

alter table closed_dates add constraint closed_dates_barbershop_id_fkey FOREIGN KEY (barbershop_id) REFERENCES barbershops(id) ON DELETE CASCADE;

alter table closed_dates add constraint closed_dates_pkey PRIMARY KEY (id);

alter table opening_hours add constraint opening_hours_barbershop_id_fkey FOREIGN KEY (barbershop_id) REFERENCES barbershops(id) ON DELETE CASCADE;

alter table opening_hours add constraint opening_hours_pkey PRIMARY KEY (id);

alter table opening_hours add constraint valid_range CHECK ((closes_at > opens_at));

alter table opening_hours add constraint valid_weekday CHECK (((weekday >= 0) AND (weekday <= 6)));

alter table phone_verifications add constraint phone_verifications_pkey PRIMARY KEY (id);

alter table services add constraint services_barbershop_id_fkey FOREIGN KEY (barbershop_id) REFERENCES barbershops(id) ON DELETE CASCADE;

alter table services add constraint services_pkey PRIMARY KEY (id);


-- ══════════════════ INDICES (21) ══════════════════

CREATE INDEX appointments_barber_date_idx ON public.appointments USING btree (barber_id, date);

CREATE INDEX appointments_by_day ON public.appointments USING btree (barbershop_id, date);

CREATE INDEX appointments_by_phone ON public.appointments USING btree (client_phone);

CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id);

CREATE UNIQUE INDEX appointments_slot_unique ON public.appointments USING btree (barbershop_id, COALESCE(barber_id, '00000000-0000-0000-0000-000000000000'::uuid), date, "time") WHERE (status = ANY (ARRAY['confirmed'::text, 'done'::text]));

CREATE UNIQUE INDEX appointments_token_key ON public.appointments USING btree (token);

CREATE UNIQUE INDEX barber_absences_barber_id_date_key ON public.barber_absences USING btree (barber_id, date);

CREATE INDEX barber_absences_date_idx ON public.barber_absences USING btree (barber_id, date);

CREATE UNIQUE INDEX barber_absences_pkey ON public.barber_absences USING btree (id);

CREATE UNIQUE INDEX barbers_pkey ON public.barbers USING btree (id);

CREATE INDEX barbers_shop_idx ON public.barbers USING btree (barbershop_id) WHERE active;

CREATE UNIQUE INDEX barbershops_owner ON public.barbershops USING btree (owner_id);

CREATE UNIQUE INDEX barbershops_pkey ON public.barbershops USING btree (id);

CREATE UNIQUE INDEX barbershops_slug_key ON public.barbershops USING btree (slug);

CREATE UNIQUE INDEX closed_dates_barbershop_id_date_key ON public.closed_dates USING btree (barbershop_id, date);

CREATE UNIQUE INDEX closed_dates_pkey ON public.closed_dates USING btree (id);

CREATE UNIQUE INDEX opening_hours_pkey ON public.opening_hours USING btree (id);

CREATE UNIQUE INDEX phone_verifications_pkey ON public.phone_verifications USING btree (id);

CREATE INDEX verifications_by_phone ON public.phone_verifications USING btree (phone, created_at DESC);

CREATE INDEX services_by_shop ON public.services USING btree (barbershop_id) WHERE active;

CREATE UNIQUE INDEX services_pkey ON public.services USING btree (id);


-- ══════════════════ RLS POLICIES (7) ══════════════════

-- public.appointments (ALL, roles: public)
  USING (barbershop_id IN ( SELECT barbershops.id
   FROM barbershops
  WHERE (barbershops.owner_id = auth.uid())))

-- public.barber_absences (ALL, roles: authenticated)
  USING (EXISTS ( SELECT 1
   FROM (barbers br
     JOIN barbershops b ON ((b.id = br.barbershop_id)))
  WHERE ((br.id = barber_absences.barber_id) AND (b.owner_id = auth.uid()))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM (barbers br
     JOIN barbershops b ON ((b.id = br.barbershop_id)))
  WHERE ((br.id = barber_absences.barber_id) AND (b.owner_id = auth.uid()))))

-- public.barbers (ALL, roles: authenticated)
  USING (EXISTS ( SELECT 1
   FROM barbershops b
  WHERE ((b.id = barbers.barbershop_id) AND (b.owner_id = auth.uid()))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM barbershops b
  WHERE ((b.id = barbers.barbershop_id) AND (b.owner_id = auth.uid()))))

-- public.barbershops (ALL, roles: public)
  USING (owner_id = auth.uid())

-- public.closed_dates (ALL, roles: public)
  USING (barbershop_id IN ( SELECT barbershops.id
   FROM barbershops
  WHERE (barbershops.owner_id = auth.uid())))

-- public.opening_hours (ALL, roles: public)
  USING (barbershop_id IN ( SELECT barbershops.id
   FROM barbershops
  WHERE (barbershops.owner_id = auth.uid())))

-- public.services (ALL, roles: public)
  USING (barbershop_id IN ( SELECT barbershops.id
   FROM barbershops
  WHERE (barbershops.owner_id = auth.uid())))


-- ══════════════════ TRIGGERS (0) ══════════════════


-- ══════════════════ EVENT TRIGGERS (7) ══════════════════

-- ensure_rls: ddl_command_end O -> rls_auto_enable()

-- issue_graphql_placeholder: sql_drop O -> set_graphql_placeholder()

-- issue_pg_cron_access: ddl_command_end O -> grant_pg_cron_access()

-- issue_pg_graphql_access: ddl_command_end O -> grant_pg_graphql_access()

-- issue_pg_net_access: ddl_command_end O -> grant_pg_net_access()

-- pgrst_ddl_watch: ddl_command_end O -> pgrst_ddl_watch()

-- pgrst_drop_watch: sql_drop O -> pgrst_drop_watch()


-- ══════════════════ COLUMNAS (65) ══════════════════

-- appointments.id uuid NOT NULL DEFAULT gen_random_uuid()

-- appointments.barbershop_id uuid NOT NULL

-- appointments.service_id uuid NOT NULL

-- appointments.client_name text NOT NULL

-- appointments.client_phone text NOT NULL

-- appointments.date date NOT NULL

-- appointments.time time without time zone NOT NULL

-- appointments.token text NOT NULL DEFAULT encode(gen_random_bytes(9), 'hex'::text)

-- appointments.status text NOT NULL DEFAULT 'confirmed'::text

-- appointments.created_at timestamp with time zone NOT NULL DEFAULT now()

-- appointments.cancelled_at timestamp with time zone

-- appointments.barber_id uuid

-- appointments.client_email text

-- barber_absences.id uuid NOT NULL DEFAULT gen_random_uuid()

-- barber_absences.barber_id uuid NOT NULL

-- barber_absences.date date NOT NULL

-- barber_absences.reason text

-- barber_absences.created_at timestamp with time zone NOT NULL DEFAULT now()

-- barbers.id uuid NOT NULL DEFAULT gen_random_uuid()

-- barbers.barbershop_id uuid NOT NULL

-- barbers.name text NOT NULL

-- barbers.active boolean NOT NULL DEFAULT true

-- barbers.sort_order integer NOT NULL DEFAULT 0

-- barbers.created_at timestamp with time zone NOT NULL DEFAULT now()

-- barbershops.id uuid NOT NULL DEFAULT gen_random_uuid()

-- barbershops.owner_id uuid NOT NULL

-- barbershops.name text NOT NULL

-- barbershops.slug text NOT NULL

-- barbershops.whatsapp text NOT NULL

-- barbershops.slot_minutes integer NOT NULL DEFAULT 30

-- barbershops.timezone text NOT NULL DEFAULT 'America/Argentina/Cordoba'::text

-- barbershops.trial_ends_at timestamp with time zone NOT NULL DEFAULT (now() + '30 days'::interval)

-- barbershops.subscription_status text NOT NULL DEFAULT 'trial'::text

-- barbershops.mp_subscription_id text

-- barbershops.created_at timestamp with time zone NOT NULL DEFAULT now()

-- barbershops.min_notice_min integer NOT NULL DEFAULT 60

-- barbershops.cancel_limit_min integer NOT NULL DEFAULT 60

-- barbershops.business_type text DEFAULT 'otro'::text

-- closed_dates.id uuid NOT NULL DEFAULT gen_random_uuid()

-- closed_dates.barbershop_id uuid NOT NULL

-- closed_dates.date date NOT NULL

-- closed_dates.reason text

-- closed_dates.from_time time without time zone

-- closed_dates.to_time time without time zone

-- opening_hours.id uuid NOT NULL DEFAULT gen_random_uuid()

-- opening_hours.barbershop_id uuid NOT NULL

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

-- services.id uuid NOT NULL DEFAULT gen_random_uuid()

-- services.barbershop_id uuid NOT NULL

-- services.name text NOT NULL

-- services.icon text DEFAULT '✂️'::text

-- services.duration_min integer NOT NULL DEFAULT 30

-- services.price integer NOT NULL

-- services.active boolean NOT NULL DEFAULT true

-- services.sort_order integer NOT NULL DEFAULT 0

-- services.created_at timestamp with time zone NOT NULL DEFAULT now()
