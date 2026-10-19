# RIDEFF Portal

Client area (`/`) and admin (`/admin`) for RIDEFF Business at `portal.rideff.com`.
Design handoff: `rideff_portal_handoff/` (spec in its README).

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Auth, Postgres + RLS, Storage) · next-intl (DE/EN/ID) · Vercel `fra1`.

## Setup

```bash
npm install
cp .env.example .env.local      # fill in the Supabase URL and keys
npx supabase start              # local stack (needs Docker); runs migrations + seed
npm run dev
```

Seed logins (local, code arrives in Mailpit at http://127.0.0.1:54324):
`lena@cafe-linde.de` (Inhaber), `mia@cafe-linde.de` (Mitarbeiterin), `nora@laden-mitte.de` (lead),
`rialto@rideff.com` (owner, sets up TOTP on first login).

## Checks

```bash
npx tsc --noEmit && npx eslint
scripts/db/test-local.sh        # migrations + seed + RLS tests on plain Postgres (no Docker)
node scripts/i18n/build-messages.mjs   # regenerate messages/*.json from the handoff table
```

## Layout

- `src/lib/auth/session.ts` roles come only from the database; `requireClient()` / `requireStaff(...roles)` in every layout, page and action.
- `src/proxy.ts` refreshes the session and sends signed-out visitors to `/login`.
- `supabase/migrations` schema + RLS (staff rights need an `aal2` session); `supabase/tests` RLS checks.
- `messages/` DE is canonical; `messages/MISSING.md` lists keys that still need EN/ID copy.
