-- ============================================================================
-- Servicios que se coordinan por WhatsApp en vez de agendarse
-- Fecha: 2026-08-08
-- Correr en: npm run db:migrate supabase/migrations/0010_servicios_por_consulta.sql
-- (después de 0009_servicios_por_persona.sql)
--
-- EL CASO
--
-- Una barbería que además tiene un tatuador adentro. El tatuador no da turno
-- directo: primero asesora sobre el diseño, el tamaño y cuántas sesiones lleva,
-- y recién ahí se acuerda el día. Un calendario no le sirve — necesita hablar.
--
-- Así que un servicio puede estar en uno de dos modos:
--
--   'agenda'   → lo de siempre: el cliente elige día y hora y reserva.
--   'consulta' → el cliente no reserva; se va al WhatsApp de esa persona.
--
-- QUÉ PASA DESPUÉS DE LA CONSULTA
--
-- El turno igual termina existiendo: lo carga la persona a mano desde el panel
-- cuando cerró el trato. Es importante que sea así y no un turno fantasma,
-- porque si no el tatuador queda con cero en las analíticas y parece que no
-- trabajó nunca.
--
-- POR QUÉ EL NÚMERO VA EN `staff` Y NO EN `services`
--
-- Porque el número es de la persona, no del servicio. El tatuador atiende sus
-- consultas en su celular, no en el del local. Un servicio en modo consulta
-- manda al WhatsApp de quien lo hace; si esa persona no cargó el suyo, cae al
-- del negocio (businesses.whatsapp), que siempre existe.
-- ============================================================================

alter table public.staff
  add column if not exists whatsapp text;

comment on column public.staff.whatsapp is
  'WhatsApp propio de esta persona, para los servicios en modo consulta. NULL = se usa el del negocio.';

alter table public.services
  add column if not exists booking_mode text not null default 'agenda';

comment on column public.services.booking_mode is
  'agenda = el cliente reserva día y hora. consulta = no reserva, se lo manda al WhatsApp de quien lo hace y el turno lo carga el local a mano.';

-- El default 'agenda' hace que todos los servicios que ya existen sigan
-- comportándose igual. La feature es opt-in, servicio por servicio.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'services_booking_mode_check'
  ) then
    alter table public.services
      add constraint services_booking_mode_check
      check (booking_mode in ('agenda', 'consulta'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Las dos RPC públicas tienen que llevar los datos nuevos: el navegador decide
-- con esto si muestra el calendario o el botón de WhatsApp.
-- ---------------------------------------------------------------------------
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
$function$;

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
$function$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Para verificar después de aplicar:
--   select public.public_shop_info('barberia-samuel');   -- servicios con booking_mode
--   select public.public_shop_staff('barberia-samuel');  -- personas con whatsapp
-- ---------------------------------------------------------------------------
