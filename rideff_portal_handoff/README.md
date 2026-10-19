# Handoff: RIDEFF Portal (portal.rideff.com)

## Overview
The portal for **RIDEFF Business** clients and for the RIDEFF team. One repo (`rideff-portal`) and one app, with two areas:

- **Client** at `portal.rideff.com`: project status, approvals, files, invoices and payment, messages. Leads see only their quote (Angebot) until they become clients.
- **Admin** at `portal.rideff.com/admin`: clients, inbox, pipeline, invoices, templates, client onboarding.

**Not in this repo:** the website `rideff.com` (repo `RIDEFF`) and the Life app `app.rideff.com` (repo `rideff-life`). The website links here through "Kundenportal".

Languages: **German (source)**, English, Indonesian. Email sender: `hallo@rideff.com`.

## About the design files
`design/RIDEFF Portal.dc.html` is a **design reference built in HTML**, not production code. Rebuild it in the stack below.

- Open it with a static server: `npx serve design`.
- The markup uses `{{ }}` holes. All state, mock data and behaviour live in `class Component` at the bottom of the file; `renderVals()` computes every displayed value.
- `rideff-portal-i18n.js` is the string table, as `[de, en, id]` arrays. The prototype translates by walking DOM text nodes. In production, convert it to message keys. The table is the source for EN and ID.
- `support.js` and `image-slot.js` are prototype runtime only. **Do not port them.**
- The **bottom pill bar (KUNDE / NEUKUNDE / ADMIN / ↺)** is a demo switcher. Do not build it. Real users see only the area their role allows.

### How to click through the demo
1. On the login screen, click **"Als Kundin"** or **"Als Admin"**. Any 6-digit code works.
2. Use the bottom bar to switch views:
   - **KUNDE**: Café Linde, an active client.
   - **NEUKUNDE**: Laden Mitte, a lead with a quote.
   - **ADMIN**: the admin area.
3. **↺** resets the demo state.

Full flow: NEUKUNDE → Angebot → tick AGB → "Ja, freigeben" → Rechnungen → "Bezahlen" → Stripe → ADMIN → the queue card "KUNDE ANLEGEN →" → create the client → open the client.

## Fidelity
**High fidelity.** Colours, type, spacing and copy are final. Match them pixel-accurately. Tokens are the same as the website handoff (`rideff_web_handoff/README.md` → Design Tokens). The portal is dark only:

| Use | Value |
|---|---|
| Page background | `#0B0B0C` with a 56px grid of `rgba(255,255,255,0.035)` lines |
| Card | `#111113`, border `#26262A`, radius 16px |
| Inner surface | `#0B0B0C`, border `#1F1F22` |
| Divider | `#1F1F22` |
| Text / muted / label | `#F5F5F4` / `#A1A1AA` / `#8A8A93` |
| Brand / accents | `#FF6A00`, `#FF9A50`, `#FFB27A` |
| Approval card (orange) | bg `#1F130A`, border `#5A2A08` |
| Success | bg `#0F2A18`, border `#1E5C34`, text `#86EFAC`, dot `#22A355` |
| Error / overdue | `#FCA5A5` |
| Quote document (warm paper) | bg `#E7E3DC`, text `#1C1917`, muted `#57534E`, lines `#CFC9BF` |

Type: Geist 400–700 for UI, Geist Mono for labels (uppercase, letter-spacing 0.06–0.12em). Buttons are pills (`9999px`). Mono labels are 10–12px.

---

## Decisions (confirmed by owner, Oct 2026)
- **One repo, two areas.** Admin lives at `/admin` in the same app. Roles come from the **database**, never from the URL or the email domain.
- **Client login:** email plus a 6-digit one-time code, no password. Admin staff **must** use 2FA.
- **Client roles:**
  - **Inhaber** (owner): everything, including paying and approving.
  - **Mitarbeiter** (employee): can view and chat only.
- **Staff roles:** prepare these from day one, even if only the owner uses them at first.
  - **Owner:** everything.
  - **Support:** clients, chat and files. No invoices.
  - **Finanzen:** invoices and payments only.
  - **Builder:** project phase, files and chat.
- **Quote approval:** one click on "Freigeben", after ticking the AGB checkbox.
  - Store the timestamp, the IP, the user, the AGB version and a snapshot of the quote (PDF and its hash).
  - Approval forms the contract.
- **Payment:** Stripe is the default (card, SEPA direct debit, Klarna). Bank transfer is an alternative.
  - When a client announces a transfer, the invoice status becomes "ANGEKÜNDIGT".
  - Staff then confirms the payment manually ("ALS BEZAHLT ✓").
- **Invoices from admin** are either one-time (for example setup) or monthly.
  - Monthly invoices are a Stripe subscription.
  - A subscription invoice cannot be paid by bank transfer.
- **Chat:** one thread **per item** (for example "Startseite, Entwurf 2", "Shop-Import", "Rechnung September"), not one thread per client.
- **Client invite:** staff creates the client, and the system sends the "Willkommen im Portal" template with the login link.
- **Multiple projects per client:** a project picker in the header (dropdown). The pages inside stay the same.
- **Navigation:**
  - Keep the top tabs.
  - Add a bell for notifications and a "Settings" entry in the profile menu.
- **Notifications:** in-app and email for:
  - a new approval
  - a chat reply
  - a new invoice or a due date
  - a test-run invite and its reminder
  - a project phase change
  - a weekly summary
- **Languages:** DE, EN, ID. The prototype switch only shows DE/EN; production must show all three.

## Prices shown in the portal
- Packages (net, plus 19 % VAT), 12-month term:
  - **Core:** €149 / month, setup from €1.290.
  - **Growth:** €249 / month, setup from €1.990.
  - **Whole system:** €449 / month, setup from €3.900.
- The demo quote is **Growth: €1.990 setup, €249 a month, 12 months**.
- Included in the quote: hosting in the EU, your own domain, SSL, backups and updates, and support through the portal (see the open items).

---

## Screens
The screenshots in `screenshots/` are numbered in demo-flow order. The HTML is the source of truth.

### Client (Kunde)
| # | Screen | Notes |
|---|---|---|
| 01 | **Projekt** | Status (% plus a 5-phase bar), the approval card (KI tag, deadline, ↵ ANSEHEN / E ÄNDERN), activity LOG, next meeting, package, and a chat card "Fragen Sie Rialto" (dark). |
| 02 | **Dateien** | File list (type, name, from, date, size) and upload. |
| 03 | **Rechnungen** | Invoice list. Status OFFEN / BEZAHLT / ANGEKÜNDIGT. "BEZAHLEN" appears on open invoices. ↓ PDF on every invoice. The header shows "n OFFEN" or "ALLES BEZAHLT ✓". |
| 04 | **Entwurf preview** | Modal with a Desktop/Handy toggle, a "Neu in Entwurf 2" list, ↵ JA, FREIGEBEN and E ÄNDERUNG WÜNSCHEN. The change textarea is sent with ⌘↵. |
| 05–07 | **Angebot (lead)** | Left: the quote document on warm paper. Right: the "Passt das Angebot so?" panel (detailed in the next table). |
| 08–09 | **Bezahlen** | Modal (detailed in the next table). |

**Angebot (05–07), left: quote document on warm paper**
- Number and title.
- Four **service groups**, each with ✓ sub-points and "inklusive":
  - Internes System mit KI
  - Team-App
  - Website oder Online-Shop
  - Betrieb & Technik
- Price rows: setup, monthly, term.
- Trust chips: DATEN IN DER EU, GEBAUT, LIVE, BETREUT, ALLES IM PORTAL.
- Net-price note.

**Angebot (05–07), right: panel "Passt das Angebot so?"**
- Summary rows: Paket, Setup, Monatlich, Laufzeit, Hosting & Domain.
- AGB checkbox with a link to `rideff.com/agb`.
- "↵ JA, FREIGEBEN", disabled until the AGB box is ticked.
- Legal note.
- After approval, a green card with the time and the "IP GESPEICHERT" note, plus a button "→ ZU RECHNUNGEN".
- **Approval automatically creates the setup invoice.**

**Bezahlen (08–09)**
- Gross amount large, with net + VAT below it.
- Pick a method:
  - **Stripe** (card, SEPA, Klarna): "Weiter zu Stripe →" opens Stripe Checkout and returns paid.
  - **Überweisung**: shows the recipient, the IBAN and the invoice number as the reference. "ICH HABE ÜBERWIESEN" sets the invoice to ANGEKÜNDIGT.

A lead's header shows only ANGEBOT, plus RECHNUNGEN once an invoice exists.

### Admin
| # | Screen | Notes |
|---|---|---|
| 10 | **Kunden** | KPI strip (MRR with 12-month bars, Kunden, Freigaben, Offen, Leads). Client table: phase, next step, MRR. J/K/↵, F filters to "needs action". Right column "KI · HEUTE ENTSCHEIDEN": a decision queue with an action and "S SPÄTER"; info cards can carry a CTA, for example "KUNDE ANLEGEN →". The table footer has "+ KUNDE ANLEGEN". |
| 11–12 | **Neuer Kunde** | Detailed below the table. |
| 13 | **Inbox** | Detailed below the table. |
| 14 | **Pipeline** | Leads: stage, next step, potential. After approval the lead shows "FREIGEGEBEN ✓ · Kunde anlegen". |
| 15 | **Rechnungen** | List with status. "ERINNERUNG SENDEN" on open or overdue invoices; "ALS BEZAHLT ✓" on announced ones. "+ RECHNUNG ERSTELLEN" opens a panel (detailed below the table). |
| 16 | **Vorlagen** | Template list and body with {Variablen}, plus "Kopieren". Templates: Angebot Core, Angebot Growth, Freigabe anfragen, Zahlungserinnerung, Willkommen im Portal, Testlauf-Einladung. |
| 17 | **Kunde detail** | Phase bar, contact, next step with a CTA (e.g. "ALS KUNDE ANSEHEN →"), activity. J/K moves to the previous or next client, Esc goes back. |
| 18 | **⌘K palette** | Jump to any screen or client. If nothing matches, it falls back to "ask the AI". |

**Neuer Kunde (11–12)**
- Form fields: Firma, Ansprechpartner, E-Mail, Ort (optional).
- Package picker: Core, Growth, Whole system.
- Role note: the contact becomes Inhaber.
- Toggle "Willkommens-Mail senden".
- Right column: **live email preview** from the template "Willkommen im Portal", with {Vorname} filled in.
- "ANLEGEN & EINLADEN →" stays disabled until the form is valid.
- On success: a green card with "KUNDE ÖFFNEN →" and "WEITEREN KUNDEN ANLEGEN".

**Inbox (13): three columns**
- **Threads:** client, KIND · Element, last message, unread dot, ✓ when answered.
- **Conversation:** element header, message bubbles, reply field (↵ sends).
- **Context:** package, location, phase, MRR, next step, "KUNDE ÖFFNEN →".
- The tab label shows the unread count ("INBOX 3").
- J/K moves between threads.

**Rechnung erstellen panel (15)**
- Fields:
  - Kunde (select).
  - Einmalig or Monatlich.
  - Posten.
  - Betrag netto.
- Live totals: Netto, MwSt. 19 %, Gesamt.
- Payment-method toggles (Stripe / Überweisung). For Monatlich, Stripe is forced and transfer is off, with the note "ABO: STRIPE BUCHT MONATLICH, BIS GEKÜNDIGT".
- "ERSTELLEN & SENDEN".

### Login
- Email, then the 6-digit code.
- Error messages: "BITTE EINE GÜLTIGE E-MAIL EINGEBEN.", "DER CODE HAT 6 ZIFFERN."
- Footer: "GESCHÜTZT · DATEN IN DER EU" and the language switch.
- Profile menu (avatar): name, email, language, Abmelden.

## Keyboard
- Global:
  - ⌘K / Ctrl+K opens the palette.
  - Esc closes the innermost layer: palette → pay modal → preview → edit → detail → Neuer Kunde.
- Client, Projekt:
  - ↵ opens the preview, E opens the change request.
  - In the preview: ↵ approves, E requests a change.
- Lead, Angebot: ↵ approves once the AGB box is ticked.
- Admin, Kunden:
  - J/K select a row, ↵ opens it, F toggles the filter, S snoozes the top queue item.
  - In the detail view: J/K move to the next or previous client.
- Admin, Inbox: J/K move between threads, S skips.
- Shortcuts are ignored while typing in a field. Show the hints exactly as in the design.

---

## Stack (recommended)
- **Next.js (App Router) + TypeScript + Tailwind CSS v4.**
- **Vercel**, region `fra1`.
- **Supabase** in an EU region (Frankfurt), separate from the Life project:
  - **Auth**: email OTP for clients; OTP plus TOTP 2FA for staff.
  - **Postgres** with **row-level security**.
  - **Storage** for files.
- **Stripe:**
  - Checkout for one-time invoices.
  - Billing subscriptions for monthly invoices.
  - Payment methods: card, SEPA Debit, Klarna.
  - Webhooks set the invoice status.
- **Resend** for transactional email (templates in DE/EN/ID).
- **next-intl** for DE/EN/ID.

## Data model (minimum)
- `organizations`: client company. `status`: lead or client. Package, city, since.
- `org_members`: user, org, role (`inhaber` | `mitarbeiter`).
- `staff`: user, role (`owner` | `support` | `finanzen` | `builder`), `totp_enabled`.
- `projects`: org, name, `phase` (1–5: Erstgespräch, Analyse, Bauen, Testen, Live), `progress_pct`, go-live date.
- `items`: project, title (for example "Startseite, Entwurf 2"), kind, status (`open` | `approved` | `changes_requested`), deadline, preview images, a "what's new" list.
- `threads`: project, optional `item_id`. `messages`: thread, author, body, `read_at`.
- `files`: project, storage path, `uploaded_by`, size, type.
- `offers`: org, package, setup net, monthly net, term months, included groups, status, plus `accepted_at`, `accepted_ip`, `accepted_by`, `agb_version` and `snapshot_pdf_hash`.
- `invoices`: number (`R-YYYY-NNN`), org, kind (`once` | `subscription`), item, net, VAT 19 %, status (`open` | `announced` | `paid` | `overdue`), allowed methods, Stripe IDs, due date.
- `leads`: name, stage, next step, potential, notes.
- `activity_log`: everything shown in LOG and AKTIVITÄT.
- `access_log`: staff "view as client" sessions (who, when, which org).
- `notifications`, `templates`.

### Rules
- **RLS:**
  - A member reads only their own org.
  - A Mitarbeiter cannot approve or pay.
  - Staff permissions follow the role table above.
- **Every `/admin` route** checks the staff role on the server.
- **Approval** is a server action that writes the offer snapshot and the audit fields, creates the setup invoice and sends the notifications.
- **Invoice PDFs** must be real German invoices (§14 UStG: seller address, tax number or VAT ID, invoice date, service date, consecutive number). The prototype PDF is a mock.

---

## Mock behaviour in the prototype (do not copy)
- Any 6-digit code logs in. The role is guessed from the email domain `@rideff.de`, but the owner's address is `@rideff.com`. **In production, read the role from the database.**
- The chat auto-replies, and the AI queue and palette answers are fake.
- The demo date is fixed to 13.10.2026.
- The Stripe redirect is simulated (1.5 s, then paid).
- The IBAN is the placeholder `[IBAN]`.
- The preview screenshots are `image-slot` placeholders. Load the item's real preview images in production.
- The invoice PDF is generated by hand in JS.
- KPI numbers and all client data are illustrative.

## Not designed yet
Build these in the same style, using the same cards, mono labels and pills. **List your plan and ask before building each one.**
1. **2FA screens for staff:** setup with a QR code, code entry and recovery codes.
2. **Access log and "view as client":** a banner at the top while viewing as a client, plus a log list for the owner.
3. **Notifications:** a bell with an unread count, a dropdown list, email versions and email preferences in Settings.
4. **Settings:**
   - Profile: name, email, language.
   - Client team: invite members and set Inhaber or Mitarbeiter.
5. **Multiple projects:** a project dropdown in the client header.
6. **Admin project editing:** change phase and %, create items for approval, upload preview images and files for the client.
7. **Team screen:** staff list with roles.
8. **Pipeline actions:** add a lead and move it between stages.

---

## Open items for the owner
1. **Hosting, domain, SSL, backups and support are now "inklusive" in the quote.**
   - Confirm the limits: one domain? `.de` only? Are email mailboxes included?
   - Add the same wording to the website packages and the AGB.
2. Real IBAN and account holder for bank transfer.
3. **Invoice data:** tax number or VAT ID, address, payment terms (due after how many days?).
4. **Datenschutz:** add Supabase, Stripe (and Klarna) and Resend. This needs legal review.
5. **AGB:** versioned. The approval stores the version.
6. **Translations:** about 110 new portal strings were translated to EN and ID by the designer. Have them reviewed.
7. **Accounts:** Stripe (with SEPA and Klarna activated) and Resend (`rideff.com` domain verified).

## Files
```
design/
  RIDEFF Portal.dc.html     Client + admin portal (reference)
  rideff-portal-i18n.js     Strings [de, en, id]
  support.js, image-slot.js Prototype runtime only (do not port)
  assets/                   rideff-mark.png, rideff-logo.png, favicon.png
screenshots/                01–18, demo-flow order (see Screens)
PROMPT.md                   Paste into Claude Code
```
