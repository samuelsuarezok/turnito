-- ════════════════════════════════════════════════════════════════════════
-- RUBROS — Turnito deja de ser sólo para barberías.
-- Correr ENTERO en el SQL Editor de Supabase. Es idempotente.
--
-- Qué agrega:
--   1. `barbershops.business_type` → a qué se dedica el negocio.
--   2. Backfill: todo lo que ya existe es una barbería.
--
-- El rubro NO cambia ninguna lógica de turnos: sólo el vocabulario de la
-- app y qué servicios se sugieren al arrancar. Un negocio sin rubro (o con
-- uno desconocido) cae en 'otro' del lado del código y habla genérico, así
-- que esta migración no puede romper nada que hoy funcione.
-- ════════════════════════════════════════════════════════════════════════

alter table public.barbershops
  add column if not exists business_type text;

-- Los negocios que ya están cargados son barberías: es lo único que Turnito
-- vendía hasta ahora. Sin esto, mañana verían el vocabulario genérico.
update public.barbershops
  set business_type = 'barberia'
  where business_type is null;

alter table public.barbershops
  alter column business_type set default 'otro';

-- Lista cerrada, en sync con RUBRO_IDS en lib/rubros.ts. Si agregás un rubro
-- allá, agregalo acá.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'barbershops_business_type_check'
      and conrelid = 'public.barbershops'::regclass
  ) then
    alter table public.barbershops
      add constraint barbershops_business_type_check
      check (business_type in (
        'barberia', 'unas', 'pestanas', 'tatuajes', 'peluqueria', 'otro'
      ));
  end if;
end $$;

-- Refrescar el cache de PostgREST para que vea la columna nueva.
notify pgrst, 'reload schema';
