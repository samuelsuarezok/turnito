# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Turnito — online booking for appointment-based businesses (barbers, nails,
lashes, tattoos, hair salons). A business shares a link and the client books
without an app or account.

Next.js 16 (App Router) + Supabase (Postgres + Auth) + Tailwind v4. Deployed on
Vercel. The full README (in Spanish) is the primary source of truth for
architecture and gotchas — read it before making non-trivial changes. This file
summarizes what matters for working in the code; don't duplicate the README's
detail here.

**Routes**: `/<slug>` public booking screen · `/t/<token>` client view/cancel
(the token IS the credential) · `/panel` + `/panel/config` owner dashboard ·
`/admin` platform view (who uses Turnito, until when).

## Commands

```bash
npm run dev                          # dev server on :3000
npx tsc --noEmit                     # typecheck (what CI runs)
npx eslint                           # lint (what CI runs)
npm run test:e2e                     # Playwright e2e — READ e2e-local/README.md FIRST
npm run test:auth -- <email>         # generate the session cookie the e2e tests use
npm run test:rls                     # audits cross-tenant data isolation
npm run db:migrate <file> [--dry]    # run one migration in a transaction; --dry rolls back
npm run db:snapshot                  # regenerate supabase/schema.snapshot.sql
```

Single e2e spec: `npx playwright test --config e2e-local/playwright.config.ts e2e-local/<file>.spec.ts`
(the Playwright config lives in `e2e-local/`, not the repo root — always pass `--config`).

**e2e tests hit the real Supabase project used by the app** — there is no test
database. They are not in CI for that reason. Before running them: `npm run dev`
in one terminal, `npm run test:auth -- <owner-email>` in another (session JWT
expires in 1h — regenerate if the whole suite suddenly fails), then
`npm run test:e2e`. The suite runs serially (`workers: 1`) on purpose — specs
share real, mutable state. Read `e2e-local/README.md` in full before adding or
touching a spec; it documents real incidents (a spec that moved another
customer's appointment, a race on the unique day+time slot index).

## Architecture

### Almost everything runs in the browser, protected only by RLS

Pages are `"use client"` and talk to Supabase directly from the browser. The
app code is not the security boundary — Postgres Row Level Security is. When
adding a table, remember **a GRANT happens before the RLS policy is
evaluated**: without `grant ... to authenticated`, the table returns `42501`
and the policy never even runs. This has broken a feature in production before
(fixed in `supabase/migrations/0007_fix_staff_grants.sql`). Verify isolation
between businesses with `npm run test:rls`.

`/admin` is the one exception: it renders server-side (`app/admin/page.tsx`)
because it needs to see every business, so it runs with the service role key
and can't live in the browser like the rest of the app. Gated by `ADMIN_EMAILS`
(server-only env var, no `NEXT_PUBLIC_` prefix) — unset, `/admin` 404s for
everyone by design. Its Postgres functions (`admin_resumen`, `admin_negocios`,
`admin_acceso`, in migration `0013`) have `EXECUTE` revoked from `public` and
granted only to `service_role`.

### `/api/book` (`app/api/book/route.ts`) is the only public endpoint that writes

It uses the **service role key**, so it bypasses RLS and all GRANTs — anything
that gets past its validation goes straight into the database. Three layers:

1. **Per-business booking cap** — enforced by a Postgres trigger
   (`0006_booking_caps_trigger.sql`), multiplying `daily_booking_cap` by active
   staff count. Deliberately lives in the DB, not app code, to avoid the
   count-then-insert race condition a prior in-code version had. Tune with a
   plain `UPDATE`, no migration needed.
2. **Per-IP rate limit** (5/hour, 10/day) — `lib/rate-limit.ts` +
   `booking_attempts` table. Fails open on purpose.
3. **Honeypot + field validation** — `lib/validate-booking.ts`.

### Migrations run by hand — nothing auto-migrates on deploy

Numbered sequentially (`0001`, `0002`, ...; never timestamps) in
`supabase/migrations/`. After merging a migration, someone has to run
`npm run db:migrate supabase/migrations/00XX_name.sql` (use `--dry` first to
test with a rollback). Needs `SUPABASE_DB_PASSWORD` in `.env.local`.

### Email (`lib/email.ts`)

Two emails fire in parallel on booking, after the appointment is already saved
in the DB — `sendEmail` never throws, always returns `{ ok: false }` on
failure, so a dead email provider never loses a booking. Owner notification
always sends; client confirmation is gated behind `NEXT_PUBLIC_EMAIL_ENABLED=1`
**plus a 4-step checklist documented in the file header** (migration `0002`,
verifying the sender in Mailjet, updating the privacy policy, then the flag) —
setting the env var alone silently breaks bookings with an email (missing
column). Provider is Mailjet, chosen because it doesn't require owning a
domain yet; swapping providers means rewriting only `sendEmail`.

### Sentry (`lib/sentry-options.ts`)

Off unless `NEXT_PUBLIC_SENTRY_DSN` is set (logs this at startup). Session
Replay and `sendDefaultPii` are off on purpose — the panel shows real
customers' names and phone numbers.

### CI (`.github/workflows/ci.yml`)

Only runs `tsc --noEmit` and `eslint` on push/PR to `main`. E2e tests are
deliberately excluded (they'd write to the real production Supabase project on
every push) — see the comment at the end of that file for what's needed to
change that.

## Key files

- `lib/slots.ts` — shared scheduling grid / availability logic
- `lib/rubros.ts` — per-business-type configuration (barbers, nails, etc.)
- `lib/admin.ts` — who can access `/admin`
- `lib/supabase/{client,server,admin}.ts` — the three Supabase client contexts (browser, server component, service role)
- `scripts/migrate.mjs`, `scripts/introspect.mjs` — migration runner and schema snapshot generator
