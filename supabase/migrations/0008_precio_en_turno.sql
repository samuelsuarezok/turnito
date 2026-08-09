-- ============================================================================
-- Precio y nombre del servicio CONGELADOS en el turno
-- Fecha: 2026-08-08
-- Correr en: npm run db:migrate supabase/migrations/0008_precio_en_turno.sql
-- (después de 0007_fix_staff_grants.sql)
--
-- POR QUÉ:
--
-- Hasta ahora, para saber cuánto facturó un turno había que unirlo con
-- `services` y leer `services.price`, o sea el precio de HOY. Si el negocio
-- sube el corte de $8.000 a $10.000, la facturación del mes pasado sube sola:
-- el historial se reescribe con cada cambio de lista. Un turno tiene que
-- recordar lo que costó cuando se reservó, no lo que cuesta ahora.
--
-- Con el nombre pasa lo mismo pero más silencioso: renombrar "Corte" a
-- "Corte de pelo" parte en dos cualquier reporte agrupado por servicio, y
-- nadie se da cuenta de por qué los números no cierran.
--
-- Esto NO se puede reconstruir después: el precio viejo no queda registrado en
-- ningún lado. Por eso va antes que las analíticas y no después.
--
-- Lo que NO hace falta cubrir: el borrado de servicios. La FK
-- appointments_service_id_fkey no tiene ON DELETE, así que Postgres impide
-- borrar un servicio que tenga turnos, y el panel además hace borrado lógico
-- (services.active = false). El historial ya estaba a salvo por ese lado.
-- ============================================================================

alter table public.appointments
  add column if not exists price        integer,
  add column if not exists service_name text;

comment on column public.appointments.price is
  'Precio del servicio AL MOMENTO DE RESERVAR, en pesos enteros. La facturación se calcula SIEMPRE con esto, nunca con services.price. NULL en turnos anteriores a esta migración y en los que se reservaron con el servicio sin precio.';

comment on column public.appointments.service_name is
  'Nombre del servicio al momento de reservar. Sobrevive a los renombres, así los reportes históricos no se parten.';

-- Backfill de lo que ya existe.
--
-- Es APROXIMADO a propósito y conviene saberlo: usa el precio ACTUAL del
-- servicio, que es el único dato que tenemos. Los turnos anteriores a esta
-- migración van a figurar con el precio de hoy aunque en su momento hayan
-- salido otra cosa. No hay manera de averiguar el de entonces.
-- De acá en adelante el dato es exacto.
update public.appointments a
   set price        = coalesce(a.price, s.price),
       service_name = coalesce(a.service_name, s.name)
  from public.services s
 where s.id = a.service_id
   and (a.price is null or a.service_name is null);

-- Refrescar el cache de PostgREST para que vea las columnas nuevas.
notify pgrst, 'reload schema';
