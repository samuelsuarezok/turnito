-- ============================================================================
-- FIX: la gestión de equipo está rota en producción
-- Fecha: 2026-08-05
-- Correr en: npm run db:migrate supabase/migrations/0007_fix_staff_grants.sql
--
-- SÍNTOMA
-- El panel de configuración no puede listar, crear ni editar el equipo. El
-- dueño legítimo, logueado, recibe:
--     42501: permission denied for table staff
-- Verificado contra la base real con la sesión del dueño de "barberia samuel".
-- Como consecuencia `staff` queda siempre vacío, `hasStaff` da false en
-- /api/book y toda la feature de varias agendas es código muerto.
--
-- CAUSA
-- 0001_barberos.sql creó las tablas, activó RLS y escribió las policies
-- (barbers_owner_all / barber_absences_owner_all, hoy sobre staff y
-- staff_absences por el rename). Las policies están BIEN. Lo que falta es el
-- GRANT de tabla.
--
-- El detalle que se come a todo el mundo:
--
--   Una policy de RLS es un FILTRO, no un PERMISO.
--
-- Postgres evalúa el GRANT ANTES que la policy. Sin GRANT devuelve 42501 y no
-- llega nunca a mirar la policy. Por eso la policy parecía correcta y la tabla
-- igual respondía "permission denied".
--
-- Las tablas viejas (services, opening_hours…) sí tienen el grant, porque vienen
-- del esquema original. Solo las que nacieron en 0001 se quedaron sin él.
--
-- POR QUÉ ESTO NO ABRE UN AGUJERO
-- El GRANT habilita a `authenticated` a *intentar*; quien decide qué filas ve
-- es la policy, que ya scopea por dueño (join contra businesses.owner_id).
-- A `anon` NO se le da nada: sigue bloqueado, igual que el resto de las tablas.
-- ============================================================================

grant select, insert, update, delete on public.staff            to authenticated;
grant select, insert, update, delete on public.staff_absences   to authenticated;

-- anon queda explícitamente afuera. Redundante hoy, pero deja la intención
-- escrita: al público solo se llega por las RPC (public_shop_staff).
revoke all on public.staff          from anon;
revoke all on public.staff_absences from anon;

-- ---------------------------------------------------------------------------
-- Para verificar después de aplicar, logueado como dueño:
--   select count(*) from public.staff;              -- debe responder, no 42501
--   insert into public.staff (business_id, name) values ('<tu-business-id>', 'X');
-- ---------------------------------------------------------------------------
