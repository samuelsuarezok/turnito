# Turnito

Turnos online para negocios que atienden con cita: barberías, uñas, pestañas,
tatuajes, peluquerías. El negocio comparte un link y el cliente reserva solo,
sin apps ni cuentas.

- **Público**: `/<slug>` — la pantalla de reserva del negocio.
- **Cliente**: `/t/<token>` — ver o cancelar el turno. El token ES la credencial.
- **Dueño**: `/panel` y `/panel/config`.
- **Plataforma**: `/admin` — cuántos usan Turnito y hasta cuándo tiene acceso cada uno.

Next.js 16 (App Router) + Supabase (Postgres + Auth) + Tailwind. Deploy en Vercel.

---

## Arrancar de cero

```bash
npm ci
cp .env.example .env          # completá los 3 valores obligatorios
npm run dev
```

Las variables están explicadas en [`.env.example`](.env.example). Las tres
obligatorias salen de Supabase → Project Settings → API.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en :3000 |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Tests end-to-end (leer [`e2e-local/README.md`](e2e-local/README.md) primero) |
| `npm run test:auth -- <email>` | Genera la cookie de sesión que usan los tests |
| `npm run test:rls` | Auditoría de aislamiento entre negocios |
| `npm run db:migrate <archivo>` | Corre una migración en una transacción. Con `--dry` hace rollback |
| `npm run db:snapshot` | Regenera `supabase/schema.snapshot.sql` |

---

## Cosas que conviene saber antes de tocar

### 1. Casi todo corre en el browser

Las páginas son `"use client"` y hablan con Supabase directo desde el navegador.
**Lo único que te protege es RLS**, no el código de la app. Si agregás una tabla:

> **Una policy de RLS es un FILTRO, no un PERMISO.** Postgres evalúa el `GRANT`
> ANTES que la policy. Sin `grant ... to authenticated` la tabla devuelve
> `42501` y la policy no se ejecuta nunca.

Eso ya pasó: la gestión de equipo estuvo rota en producción por un `GRANT`
faltante. Lo arregla `supabase/migrations/0007_fix_staff_grants.sql`.

Para verificar que un negocio no puede ver los datos de otro: `npm run test:rls`.

### 2. `/api/book` es el único endpoint público que escribe

Y usa la **service role key**, así que saltea RLS y todos los GRANTs. Todo lo que
entre sin validar entra directo a la base. Tiene tres capas:

| Capa | Dónde | Falla abierta? |
|---|---|---|
| Cupo por negocio | Trigger de Postgres (`0006`) | **Imposible** |
| Límite por IP (5/h, 10/día) | `lib/rate-limit.ts` + tabla `booking_attempts` | Sí, a propósito |
| Honeypot + validación | `lib/validate-booking.ts` | — |

El **cupo vive en la base y no en el código** a propósito: en el código tenía una
race condition (entre el count y el insert pasaban requests concurrentes) y podía
quedar inactivo si la query fallaba. En un trigger no puede pasar ninguna de las dos.

**Si las reservas empiezan a fallar con 429**, mirá el rollback documentado al
final de `supabase/migrations/0006_booking_caps_trigger.sql`.

Los cupos son **por agenda**: el trigger multiplica `daily_booking_cap` por la
cantidad de staff activo. Se tunean con un `UPDATE`, sin migración.

### 3. Las migraciones se corren a mano

No hay auto-migrate en el deploy. Después de mergear algo que traiga una
migración nueva, alguien tiene que correrla:

```bash
npm run db:migrate supabase/migrations/00XX_lo_que_sea.sql --dry   # prueba, revierte
npm run db:migrate supabase/migrations/00XX_lo_que_sea.sql         # aplica
```

Necesita `SUPABASE_DB_PASSWORD` en `.env.local` (Supabase → Connect → Session pooler).

Numeración correlativa: `0001`, `0002`, … No uses timestamps.

### 4. Mails: al cliente es opcional, al dueño va siempre

Cuando entra una reserva, `/api/book` manda dos mails **en paralelo**:

| A quién | Cuándo | Contiene |
|---|---|---|
| Cliente | Solo si dejó su email | Confirmación + link para gestionar el turno |
| **Dueño** | **Siempre** | Nombre, teléfono y email del cliente + `replyTo` apuntando a él |

**El turno ya está guardado cuando se mandan.** Si el proveedor falla, se loguea
y se sigue: `sendEmail` nunca tira, siempre devuelve `{ ok: false }`. Nadie
pierde una reserva porque Mailjet se cayó.

Sin las claves de Mailjet en el `.env` no sale ninguno de los dos, y no es un
error: devuelve `EMAIL_NOT_CONFIGURED`. Para prender la confirmación al cliente
hay un **checklist de 4 pasos** en el header de `lib/email.ts` — no alcanza con
poner `NEXT_PUBLIC_EMAIL_ENABLED=1`.

### 5. Monitoreo de errores

Sentry está cableado pero **apagado si no hay `NEXT_PUBLIC_SENTRY_DSN`**, y lo
avisa por consola al arrancar. Config en `lib/sentry-options.ts`.

Session Replay y `sendDefaultPii` están **apagados a propósito**: el panel muestra
nombres y teléfonos de clientes reales. No los prendas sin pensarlo.

### 6. `/admin` es la única pantalla que renderiza en el servidor

Ve **todos** los negocios, así que corre con la service role key y por lo tanto
no puede vivir en el browser como el resto de la app. Los datos bajan resueltos
desde `app/admin/page.tsx` y los cambios salen por una server action.

Quién entra lo decide `ADMIN_EMAILS` (variable del servidor, sin
`NEXT_PUBLIC_`). **Sin esa variable `/admin` es 404 para todo el mundo**: falla
cerrada a propósito. El mail que pongas tiene que ser el de una cuenta que ya
exista — si no, cualquiera puede registrarla en `/login` y quedar adentro.

Las tres funciones que usa (`admin_resumen`, `admin_negocios`, `admin_acceso`,
migración `0013`) tienen el `EXECUTE` **revocado de `public`** y concedido sólo a
`service_role`: desde el browser, con la anon key, devuelven 403.

Lo que hay que saber para operarlo: **hoy nada corta el acceso solo**.
`public_shop_info()` y `/api/book` filtran por `subscription_status`, no por
`trial_ends_at`, así que un local con la prueba vencida sigue tomando turnos
hasta que alguien lo corta desde `/admin`. Es a propósito — apagarle el local a
un cliente que pagó y todavía no registramos sería peor — y el panel lo muestra
en rojo arriba de todo para que no se olvide.

### 7. El CI solo corre chequeos estáticos

`.github/workflows/ci.yml` corre `tsc` y `eslint` en cada push y PR. **Los e2e no
están ahí**: le pegan al Supabase real y correrlos en cada push sería escribir en
producción. El comentario al final del workflow explica qué haría falta para
sumarlos.

---

## Estructura

```
app/
  [slug]/         reserva pública
  t/[token]/      ver / cancelar turno
  panel/          panel del dueño (+ config)
  admin/          plataforma: quién usa Turnito y hasta cuándo (server-side)
  api/book/       ÚNICO endpoint público que escribe
  api/contact/    formulario de la landing
lib/
  admin.ts        quién puede entrar a /admin (ADMIN_EMAILS)
  slots.ts        grilla de horarios y disponibilidad (compartida)
  rate-limit.ts   límite por IP de /api/book
  validate-booking.ts
  rubros.ts       config por tipo de negocio
  email.ts        mails de confirmación y aviso
scripts/          runner de migraciones + introspección del schema
supabase/
  migrations/     correlativas, se corren a mano
  schema.snapshot.sql
e2e-local/        tests (leer su README antes de correrlos)
```
