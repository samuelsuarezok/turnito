-- ════════════════════════════════════════════════════════════════════
-- FOTO DEL SCHEMA — generada por scripts/introspect.mjs
-- 2026-07-31T17:01:58.901Z
--
-- NO se corre. Es documentación: el schema base de Turnito vive en
-- Supabase y no estaba versionado. Regenerá con:
--     node scripts/introspect.mjs
-- ════════════════════════════════════════════════════════════════════

-- ══════════════════ FUNCIONES (9) ══════════════════

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

alter table appointments add constraint appointments_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table appointments add constraint appointments_pkey PRIMARY KEY (id);

alter table appointments add constraint appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);

alter table appointments add constraint appointments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL;

alter table appointments add constraint appointments_token_key UNIQUE (token);

alter table appointments add constraint valid_status CHECK ((status = ANY (ARRAY['confirmed'::text, 'done'::text, 'no_show'::text, 'cancelled_by_client'::text, 'cancelled_by_shop'::text])));

alter table businesses add constraint businesses_business_type_check CHECK ((business_type = ANY (ARRAY['barberia'::text, 'unas'::text, 'pestanas'::text, 'tatuajes'::text, 'peluqueria'::text, 'otro'::text])));

alter table businesses add constraint businesses_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table businesses add constraint businesses_pkey PRIMARY KEY (id);

alter table businesses add constraint businesses_slug_key UNIQUE (slug);

alter table businesses add constraint slug_format CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text));

alter table closed_dates add constraint closed_dates_business_id_date_key UNIQUE (business_id, date);

alter table closed_dates add constraint closed_dates_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table closed_dates add constraint closed_dates_pkey PRIMARY KEY (id);

alter table opening_hours add constraint opening_hours_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table opening_hours add constraint opening_hours_pkey PRIMARY KEY (id);

alter table opening_hours add constraint valid_range CHECK ((closes_at > opens_at));

alter table opening_hours add constraint valid_weekday CHECK (((weekday >= 0) AND (weekday <= 6)));

alter table phone_verifications add constraint phone_verifications_pkey PRIMARY KEY (id);

alter table services add constraint services_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table services add constraint services_pkey PRIMARY KEY (id);

alter table staff add constraint staff_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table staff add constraint staff_pkey PRIMARY KEY (id);

alter table staff_absences add constraint staff_absences_pkey PRIMARY KEY (id);

alter table staff_absences add constraint staff_absences_staff_id_date_key UNIQUE (staff_id, date);

alter table staff_absences add constraint staff_absences_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;


-- ══════════════════ INDICES (21) ══════════════════

CREATE INDEX appointments_by_day ON public.appointments USING btree (business_id, date);

CREATE INDEX appointments_by_phone ON public.appointments USING btree (client_phone);

CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id);

CREATE UNIQUE INDEX appointments_slot_unique ON public.appointments USING btree (business_id, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid), date, "time") WHERE (status = ANY (ARRAY['confirmed'::text, 'done'::text]));

CREATE INDEX appointments_staff_date_idx ON public.appointments USING btree (staff_id, date);

CREATE UNIQUE INDEX appointments_token_key ON public.appointments USING btree (token);

CREATE UNIQUE INDEX businesses_owner ON public.businesses USING btree (owner_id);

CREATE UNIQUE INDEX businesses_pkey ON public.businesses USING btree (id);

CREATE UNIQUE INDEX businesses_slug_key ON public.businesses USING btree (slug);

CREATE UNIQUE INDEX closed_dates_business_id_date_key ON public.closed_dates USING btree (business_id, date);

CREATE UNIQUE INDEX closed_dates_pkey ON public.closed_dates USING btree (id);

CREATE UNIQUE INDEX opening_hours_pkey ON public.opening_hours USING btree (id);

CREATE UNIQUE INDEX phone_verifications_pkey ON public.phone_verifications USING btree (id);

CREATE INDEX verifications_by_phone ON public.phone_verifications USING btree (phone, created_at DESC);

CREATE INDEX services_by_shop ON public.services USING btree (business_id) WHERE active;

CREATE UNIQUE INDEX services_pkey ON public.services USING btree (id);

CREATE INDEX staff_business_idx ON public.staff USING btree (business_id) WHERE active;

CREATE UNIQUE INDEX staff_pkey ON public.staff USING btree (id);

CREATE INDEX staff_absences_date_idx ON public.staff_absences USING btree (staff_id, date);

CREATE UNIQUE INDEX staff_absences_pkey ON public.staff_absences USING btree (id);

CREATE UNIQUE INDEX staff_absences_staff_id_date_key ON public.staff_absences USING btree (staff_id, date);


-- ══════════════════ RLS POLICIES (7) ══════════════════

-- public.appointments (ALL, roles: public)
  USING (business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.owner_id = auth.uid())))

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

-- services.id uuid NOT NULL DEFAULT gen_random_uuid()

-- services.business_id uuid NOT NULL

-- services.name text NOT NULL

-- services.icon text DEFAULT '✂️'::text

-- services.duration_min integer NOT NULL DEFAULT 30

-- services.price integer NOT NULL

-- services.active boolean NOT NULL DEFAULT true

-- services.sort_order integer NOT NULL DEFAULT 0

-- services.created_at timestamp with time zone NOT NULL DEFAULT now()

-- staff.id uuid NOT NULL DEFAULT gen_random_uuid()

-- staff.business_id uuid NOT NULL

-- staff.name text NOT NULL

-- staff.active boolean NOT NULL DEFAULT true

-- staff.sort_order integer NOT NULL DEFAULT 0

-- staff.created_at timestamp with time zone NOT NULL DEFAULT now()

-- staff_absences.id uuid NOT NULL DEFAULT gen_random_uuid()

-- staff_absences.staff_id uuid NOT NULL

-- staff_absences.date date NOT NULL

-- staff_absences.reason text

-- staff_absences.created_at timestamp with time zone NOT NULL DEFAULT now()
