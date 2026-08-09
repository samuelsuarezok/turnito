-- ============================================================================
-- Poder cambiar el link del local sin romper el que ya circula
-- Fecha: 2026-08-09
-- Correr en: npm run db:migrate supabase/migrations/0012_cambiar_slug.sql
-- (después de 0011_stats_negocio.sql)
--
-- EL PROBLEMA
--
-- El slug se genera del nombre en el onboarding y después queda congelado, para
-- no romper los links que el local ya repartió (bio de Instagram, estados de
-- WhatsApp, el cartel de la vidriera). Pero eso deja atrapado a cualquiera que
-- se equivocó al escribir el nombre el primer día, o que cambió de marca: el
-- panel le muestra "barberia Facu" arriba de turnito.site/barberia-samuel.
--
-- LA SALIDA
--
-- Se puede cambiar, y el anterior queda guardado redirigiendo. Nadie pierde
-- nada: el que tenía el link viejo llega igual al local.
--
-- DE PASO SE ARREGLA UN BUG QUE YA ESTABA
--
-- No había ninguna lista de slugs reservados. Hoy mismo alguien puede crear un
-- local con slug 'panel' o 'login': Next resuelve las rutas estáticas antes que
-- /[slug], así que esa página nunca sería accesible y el dueño no tendría forma
-- de entender por qué. El CHECK de abajo lo corta para todos los caminos —
-- onboarding incluido, que inserta directo en businesses.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Slugs reservados
-- ---------------------------------------------------------------------------
-- Verificado antes de escribir esto: ningún negocio existente usa uno de estos,
-- así que el CHECK entra sin romper nada.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'slug_no_reservado') then
    alter table public.businesses
      add constraint slug_no_reservado
      check (slug not in ('api', 'legales', 'login', 'onboarding', 'panel', 't', 'admin', 'www'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Los links que el local dejó de usar
-- ---------------------------------------------------------------------------
create table if not exists public.business_slugs_anteriores (
  slug        text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.business_slugs_anteriores is
  'Direcciones que el local usó antes. /[slug] las resuelve y redirige a la actual, así los links repartidos siguen funcionando.';

create index if not exists slugs_anteriores_por_negocio
  on public.business_slugs_anteriores (business_id);

alter table public.business_slugs_anteriores enable row level security;

-- Nadie escribe acá a mano: sólo la función de abajo, que es SECURITY DEFINER.
-- El dueño puede LEER los suyos (el panel los muestra) y nada más.
grant select on public.business_slugs_anteriores to authenticated;
revoke all on public.business_slugs_anteriores from anon;

drop policy if exists slugs_anteriores_lee_el_dueno on public.business_slugs_anteriores;
create policy slugs_anteriores_lee_el_dueno on public.business_slugs_anteriores
  for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_slugs_anteriores.business_id
        and b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Cambiar el slug
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER y no INVOKER, a propósito: para saber si un slug está libre
-- hay que mirar TODOS los negocios, y la RLS de businesses sólo deja ver el
-- propio. Con INVOKER, un slug ocupado por otro local se vería como libre y el
-- error saldría recién en el UPDATE, como un 23505 crudo.
--
-- Que sea DEFINER no abre nada: la función arranca resolviendo el negocio POR
-- auth.uid(). Quien la llama sólo puede tocar el suyo, y lo único que devuelve
-- de los demás es "ocupado" o "libre".
--
-- Todo pasa en una transacción: o se guarda el viejo y se actualiza, o no pasa
-- nada. No existe el estado "cambié el slug pero perdí la redirección".
create or replace function public.cambiar_slug(nuevo text)
returns json
language plpgsql
security definer
set search_path = public
as $function$
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
$function$;

grant execute on function public.cambiar_slug(text) to authenticated;
revoke execute on function public.cambiar_slug(text) from anon;

-- ---------------------------------------------------------------------------
-- 4. Resolver un link viejo (lo llama la página pública, sin sesión)
-- ---------------------------------------------------------------------------
create or replace function public.public_slug_actual(viejo text)
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select b.slug
  from business_slugs_anteriores a
  join businesses b on b.id = a.business_id
  where a.slug = viejo
    and b.subscription_status in ('trial', 'active');
$function$;

grant execute on function public.public_slug_actual(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Para verificar después de aplicar, logueado como dueño:
--   select public.cambiar_slug('panel');            -- {"ok":false,"error":"RESERVADO"}
--   select public.cambiar_slug('barberia-facu');    -- {"ok":true,...}
--   select public.public_slug_actual('barberia-samuel');  -- 'barberia-facu'
-- ---------------------------------------------------------------------------
