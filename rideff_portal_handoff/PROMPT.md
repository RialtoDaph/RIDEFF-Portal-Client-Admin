# Prompt for Claude Code: portal.rideff.com

Run this in a new, empty repo `RialtoDaph/rideff-portal`, with the folder `rideff_portal_handoff/` copied into the repo root. Paste everything below the line.

---

Build the **RIDEFF Portal** for business clients and staff. Use the design handoff in `rideff_portal_handoff/`.

**Read first:**
1. `rideff_portal_handoff/README.md`, the full spec. Read **Decisions**, **Mock behaviour** and **Not designed yet** before coding.
2. `rideff_portal_handoff/screenshots/` 01–18, for orientation.
3. `rideff_portal_handoff/design/RIDEFF Portal.dc.html`:
   - Run `npx serve rideff_portal_handoff/design` and click through the demo flow described in the README.
   - `class Component` at the bottom holds state, mock data and interactions.
   - `rideff-portal-i18n.js` holds every string as `[de, en, id]`.
   - Do not port `support.js`, `image-slot.js` or the bottom demo switcher.

**Scope:**
- Client area at `/` and admin at `/admin`, in one Next.js app.
- No marketing pages. The website `rideff.com` and the Life app `app.rideff.com` are separate repos.

**Stack:**
- Next.js (App Router), TypeScript, Tailwind CSS v4, on Vercel `fra1`.
- Supabase (EU, Frankfurt; its own project) for Auth, Postgres with RLS, and Storage.
- Stripe: Checkout, Billing, webhooks; card, SEPA and Klarna.
- Resend for email. next-intl for DE (default), EN and ID.
- Fonts: Geist and Geist Mono via `next/font`.

**Rules:**
- Match the design pixel-accurately: colours, type, spacing, radii and copy.
  - Put the tokens in the Tailwind theme as CSS variables.
  - The portal is dark only. The quote document uses the warm paper colours from the README.
- German copy is canonical.
  - Convert the i18n table to `messages/de.json`, `en.json` and `id.json` with semantic keys.
  - Never invent or machine-translate new copy; ask me.
- Roles come only from the database:
  - Client: `inhaber` / `mitarbeiter`.
  - Staff: `owner` / `support` / `finanzen` / `builder`.
  - Check them on the server for every `/admin` route and server action. Enforce data access with RLS.
- Staff must have TOTP 2FA. Clients log in with an email one-time code.
- Prices are net, plus 19 % VAT. Format money per locale: DE `€1.990`, EN `€1,990`.
- Keyboard shortcuts as listed in the README, ignored while typing.
- Accessibility: focus rings, 44px touch targets, labelled icon buttons, `aria-live` for status changes.
- No horizontal scroll at 360px. Below 820px every grid is a single column.

**Build in this order, and stop after each step for my review:**
1. **Foundation:**
   - Project setup, tokens and fonts, i18n.
   - Supabase schema and RLS from the README data model, with seed data matching the prototype (Café Linde, Laden Mitte, the other clients).
   - The login with email code, the 2FA requirement for staff, and the profile menu.
2. **Client area:**
   - Projekt: status, approval card, preview modal with approve or request change, log, next meeting, package, item chat.
   - Dateien: upload to Storage.
   - Rechnungen.
   - The project dropdown if an org has more than one project.
3. **Angebot (quote) for leads:**
   - The warm-paper document and the approval panel.
   - The server action stores `accepted_at`, IP, user, AGB version and a PDF snapshot with its hash, then creates the setup invoice and notifies staff.
4. **Payments:**
   - The pay modal.
   - Stripe Checkout for one-time invoices; Stripe subscriptions for monthly ones.
   - Bank transfer sets the invoice to `announced`; staff marks it paid.
   - Webhooks are the source of truth for paid status.
   - Real German invoice PDFs (§14 UStG). Ask me for the tax data.
5. **Admin, part 1:**
   - Kunden: KPIs, table, filter, detail, decision queue.
   - Neuer Kunde with the invite email (template "Willkommen im Portal") and the live preview.
   - Inbox: three columns, one thread per item.
6. **Admin, part 2:**
   - Pipeline.
   - Rechnungen with reminder, mark-paid and the create panel.
   - Vorlagen.
   - The ⌘K palette (navigation first; the AI answer comes later).
7. **Notifications:** in-app and email for the six events in the README, plus the weekly summary (cron).
8. **Not designed yet** (README list):
   - Propose a layout for each, built in the existing style, and wait for my OK before building it.
   - These are 2FA setup, the view-as-client banner and access log, notifications UI, settings and client team, project editing, the team screen, and pipeline actions.

**Before coding each step:** list the routes, components, tables and server actions you will create, plus any question where the prototype is unclear. Use the real copy; no lorem ipsum.

**Ask me before wiring:** Stripe keys and activated payment methods, Resend domain, IBAN and tax data, and the hosting/domain limits for the quote.

**Domain:** `portal.rideff.com` points to this Vercel project. Supabase Auth redirect URLs must use this domain.
