-- Seed data matching the prototype (demo date 13.10.2026).
-- All dates shift by (today − 13.10.2026) so deadlines and meetings stay in the future.
-- Local development only: `supabase db reset` runs this after the migrations.
-- Users log in with their email; locally the code arrives in Mailpit (http://127.0.0.1:54324).

create function pg_temp.d(p date) returns date language sql as $$
  select p + (current_date - date '2026-10-13')
$$;
create function pg_temp.ts(p text) returns timestamptz language sql as $$
  select ((p::timestamp + (current_date - date '2026-10-13') * interval '1 day') at time zone 'Europe/Berlin')
$$;
create function pg_temp.l(de text, en text default null, id text default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('de', de, 'en', en, 'id', id))
$$;

-- ── users ─────────────────────────────────────────────────────────────
create function pg_temp.mk_user(p_id uuid, p_email text, p_name text) returns void language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, '', now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
end $$;

select pg_temp.mk_user('00000000-0000-4000-a000-000000000001', 'rialto@rideff.com', 'Rialto Effendy');
select pg_temp.mk_user('00000000-0000-4000-a000-000000000101', 'lena@cafe-linde.de', 'Lena Hoffmann');
select pg_temp.mk_user('00000000-0000-4000-a000-000000000102', 'mia@cafe-linde.de', 'Mia');
select pg_temp.mk_user('00000000-0000-4000-a000-000000000201', 'nora@laden-mitte.de', 'Nora Weiß');
select pg_temp.mk_user('00000000-0000-4000-a000-000000000301', 'tarik@tic-originals.de', 'Tarik Ilhan');
select pg_temp.mk_user('00000000-0000-4000-a000-000000000401', 'jana@hotel-seeblick.de', 'Jana Petersen');
select pg_temp.mk_user('00000000-0000-4000-a000-000000000501', 'praxis@dr-koch.de', 'Dr. Anna Koch');
select pg_temp.mk_user('00000000-0000-4000-a000-000000000601', 'info@tischlerei-brandt.de', 'Martin Brandt');
select pg_temp.mk_user('00000000-0000-4000-a000-000000000701', 'ida@label-nord.de', 'Ida Sørensen');

insert into public.staff (user_id, role) values ('00000000-0000-4000-a000-000000000001', 'owner');

-- ── packages & AGB ────────────────────────────────────────────────────
insert into public.packages (key, name, monthly_net_cents, setup_from_cents, sort) values
  ('core', 'Core', 14900, 129000, 1),
  ('growth', 'Growth', 24900, 199000, 2),
  ('whole_system', 'Whole system', 44900, 390000, 3);

insert into public.agb_versions (version, url, valid_from) values ('2026-10', 'https://rideff.com/agb', '2026-10-01');

-- seed data must not notify anyone (the step-7 triggers would mail the sample clients)
alter table public.items disable trigger items_notify;
alter table public.messages disable trigger messages_notify;
alter table public.invoices disable trigger invoices_notify;
alter table public.meetings disable trigger meetings_notify;

-- ── organizations ─────────────────────────────────────────────────────
insert into public.organizations (id, name, slug, status, package, city, since, live_since, contact_name, contact_email, next_step, needs_action) values
  ('00000000-0000-4000-b000-000000000001', 'Café Linde', 'cafe-linde', 'client', 'growth', 'Leipzig', pg_temp.d('2026-09-02'), null, 'Lena Hoffmann', 'lena@cafe-linde.de',
    pg_temp.l('Freigabe Startseite, Entwurf 2', 'Approve homepage, draft 2', 'Persetujuan beranda, draf 2'), true),
  ('00000000-0000-4000-b000-000000000002', 'TIC Originals', 'tic-originals', 'client', 'growth', 'Berlin', pg_temp.d('2026-01-15'), pg_temp.d('2026-04-14'), 'Tarik Ilhan', 'tarik@tic-originals.de',
    pg_temp.l('Update Checkout, Do 16.10', 'Checkout update, Thu 16.10', 'Update checkout, Kam 16.10'), false),
  ('00000000-0000-4000-b000-000000000003', 'Hotel Seeblick', 'hotel-seeblick', 'client', 'whole_system', 'Binz', pg_temp.d('2026-10-02'), null, 'Jana Petersen', 'jana@hotel-seeblick.de',
    pg_temp.l('Analyse vor Ort, Di 21.10', 'On-site analysis, Tue 21.10', 'Analisis di lokasi, Sel 21.10'), false),
  ('00000000-0000-4000-b000-000000000004', 'Praxis Dr. Koch', 'praxis-dr-koch', 'client', 'core', 'Köln', pg_temp.d('2026-03-10'), pg_temp.d('2026-06-02'), 'Dr. Anna Koch', 'praxis@dr-koch.de',
    pg_temp.l('Rechnung September überfällig', 'September invoice overdue', 'Tagihan September jatuh tempo'), true),
  ('00000000-0000-4000-b000-000000000005', 'Tischlerei Brandt', 'tischlerei-brandt', 'client', 'core', 'Freiburg', pg_temp.d('2026-08-04'), null, 'Martin Brandt', 'info@tischlerei-brandt.de',
    pg_temp.l('Testlauf mit Team, Mo 20.10', 'Test run with team, Mon 20.10', 'Uji coba dengan tim, Sen 20.10'), true),
  ('00000000-0000-4000-b000-000000000006', 'Label Nord', 'label-nord', 'client', 'growth', 'Hamburg', pg_temp.d('2026-09-08'), null, 'Ida Sørensen', 'ida@label-nord.de',
    pg_temp.l('Shop-Import prüfen', 'Check shop import', 'Cek impor toko'), true),
  ('00000000-0000-4000-b000-000000000007', 'Weingut Berg', 'weingut-berg', 'lead', null, 'Pfalz', null, null, 'Paul Berg', 'paul@weingut-berg.de',
    pg_temp.l('Erstgespräch Fr 17.10, 09:00', 'Intro call Fri 17.10, 09:00', 'Konsultasi Jum 17.10, 09.00'), false),
  ('00000000-0000-4000-b000-000000000008', 'Laden Mitte', 'laden-mitte', 'lead', 'growth', null, null, null, 'Nora Weiß', 'nora@laden-mitte.de',
    null, false);

insert into public.org_members (org_id, user_id, role) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000101', 'inhaber'),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000102', 'mitarbeiter'),
  ('00000000-0000-4000-b000-000000000008', '00000000-0000-4000-a000-000000000201', 'inhaber'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000301', 'inhaber'),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000401', 'inhaber'),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000501', 'inhaber'),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000601', 'inhaber'),
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000701', 'inhaber');

-- ── projects ──────────────────────────────────────────────────────────
insert into public.projects (id, org_id, name, phase, progress_pct, go_live) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', 'Growth', 3, 62, pg_temp.d('2026-10-24')),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', 'Growth', 5, 100, pg_temp.d('2026-04-14')),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000003', 'Whole system', 2, 28, null),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000004', 'Core', 5, 100, pg_temp.d('2026-06-02')),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000005', 'Core', 4, 84, null),
  ('00000000-0000-4000-c000-000000000006', '00000000-0000-4000-b000-000000000006', 'Growth', 3, 40, null);

insert into public.meetings (project_id, starts_at, kind, title, subject) values
  ('00000000-0000-4000-c000-000000000001', pg_temp.ts('2026-10-16 10:30'), 'test_run',
    pg_temp.l('Testlauf Team-App mit Can und Mia · Video', 'Team app test run with Can and Mia · video', 'Uji coba app tim dengan Can dan Mia · video'),
    pg_temp.l('Team-App', 'team app', 'app tim'));

-- ── items (one thread per item) ───────────────────────────────────────
insert into public.items (id, project_id, title, kind, status, deadline, draft_no, question, whats_new, revision_due, created_by, created_at) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000001',
    pg_temp.l('Startseite, Entwurf 2', 'Homepage, draft 2', 'Beranda, draf 2'), 'approval', 'open', pg_temp.d('2026-10-17'), 2,
    pg_temp.l('Passt die Startseite so?', 'Is the homepage good like this?', 'Beranda sudah pas begini?'),
    jsonb_build_array(
      pg_temp.l('Kuchenfotos größer', 'Bigger cake photos', 'Foto kue lebih besar'),
      pg_temp.l('Vorbestellung direkt oben', 'Pre-order right at the top', 'Pre-order langsung di atas'),
      pg_temp.l('Öffnungszeiten im Kopf', 'Opening hours in the header', 'Jam buka di header')),
    pg_temp.d('2026-10-15'), '00000000-0000-4000-a000-000000000001', pg_temp.ts('2026-10-12 17:50')),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-c000-000000000005',
    pg_temp.l('Aufmaß-App'), 'test_run', 'open', null, null, null, '[]', null, '00000000-0000-4000-a000-000000000001', pg_temp.ts('2026-10-10 09:00')),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-c000-000000000006',
    pg_temp.l('Shop-Import'), 'question', 'open', null, null, null, '[]', null, '00000000-0000-4000-a000-000000000001', pg_temp.ts('2026-10-09 10:00')),
  ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-c000-000000000004',
    pg_temp.l('Rechnung September'), 'invoice', 'open', null, null, null, '[]', null, '00000000-0000-4000-a000-000000000001', pg_temp.ts('2026-10-01 08:00')),
  ('00000000-0000-4000-d000-000000000005', '00000000-0000-4000-c000-000000000002',
    pg_temp.l('Update Checkout'), 'update', 'open', null, null, null, '[]', null, '00000000-0000-4000-a000-000000000001', pg_temp.ts('2026-10-08 10:00'));

insert into public.threads (id, project_id, item_id) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-d000-000000000002'),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-d000-000000000003'),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-d000-000000000004'),
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-d000-000000000005');
-- a general thread per project
insert into public.threads (project_id) select id from public.projects;

insert into public.messages (thread_id, author_id, body, created_at, read_at) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001', 'Entwurf 2 ist online. Die Kuchenfotos habe ich größer gemacht.', pg_temp.ts('2026-10-12 18:00'), pg_temp.ts('2026-10-13 09:10')),
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000101', 'Danke! Die Öffnungszeiten könnten noch weiter nach oben.', pg_temp.ts('2026-10-13 09:12'), null),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-a000-000000000001', 'Der Testlauf wäre Mo 20.10. Passt das?', pg_temp.ts('2026-10-10 11:00'), pg_temp.ts('2026-10-13 08:39')),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-a000-000000000601', 'Montag passt. Ich bringe Jonas und Eva mit.', pg_temp.ts('2026-10-13 08:40'), null),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-a000-000000000701', 'Der Import zeigt 1.284 Teile. Bei uns sind es 1.301. Fehlen 17?', pg_temp.ts('2026-10-13 07:55'), null),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-a000-000000000501', 'Die Überweisung ist gestern raus, müsste bald ankommen.', pg_temp.ts('2026-10-12 16:20'), pg_temp.ts('2026-10-12 17:00')),
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-a000-000000000001', 'Der Gutscheincode ist im Checkout live.', pg_temp.ts('2026-10-10 10:00'), pg_temp.ts('2026-10-10 10:30')),
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-a000-000000000301', 'Perfekt, danke Rialto.', pg_temp.ts('2026-10-10 10:31'), pg_temp.ts('2026-10-10 11:00'));

-- ── files (Café Linde). The storage objects are not seeded. ────────────
-- (the upload trigger would add LOG lines; the seed brings its own)
alter table public.files disable trigger files_log;
insert into public.files (project_id, storage_path, name, ext, size_bytes, uploaded_by, created_at) values
  ('00000000-0000-4000-c000-000000000001', 'seed/cafe-linde/startseite-entwurf-2.fig', 'Startseite, Entwurf 2', 'FIG', 4404019, '00000000-0000-4000-a000-000000000001', pg_temp.ts('2026-10-12 17:45')),
  ('00000000-0000-4000-c000-000000000001', 'seed/cafe-linde/schichten-herbst.xlsx', 'schichten-herbst', 'XLSX', 38912, '00000000-0000-4000-a000-000000000101', pg_temp.ts('2026-09-29 15:40')),
  ('00000000-0000-4000-c000-000000000001', 'seed/cafe-linde/fotos-kuchen-vitrine.zip', 'Fotos Kuchen, Vitrine', 'ZIP', 65011712, '00000000-0000-4000-a000-000000000101', pg_temp.ts('2026-09-24 12:00')),
  ('00000000-0000-4000-c000-000000000001', 'seed/cafe-linde/analyse-und-plan.pdf', 'Analyse und Plan', 'PDF', 1153434, '00000000-0000-4000-a000-000000000001', pg_temp.ts('2026-09-16 10:00')),
  ('00000000-0000-4000-c000-000000000001', 'seed/cafe-linde/logo-cafe-linde.png', 'Logo Café Linde', 'PNG', 430080, '00000000-0000-4000-a000-000000000101', pg_temp.ts('2026-09-04 09:00')),
  ('00000000-0000-4000-c000-000000000001', 'seed/cafe-linde/angebot-growth-unterschrieben.pdf', 'Angebot Growth, unterschrieben', 'PDF', 188416, '00000000-0000-4000-a000-000000000101', pg_temp.ts('2026-09-02 11:00'));

alter table public.files enable trigger files_log;

update public.items set after_approval = pg_temp.l('Testlauf Do', 'Test run Thu', 'Uji coba Kam')
  where id = '00000000-0000-4000-d000-000000000001';

-- ── activity (LOG for the client, AKTIVITÄT for the team) ─────────────
insert into public.activity_log (org_id, project_id, tag, event, params, text, client_visible, created_at) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'build', null, '{}',
    pg_temp.l('Vorbestellung mit Abholzeit live auf Staging', 'Pre-order with pickup time live on staging', 'Pre-order dengan jam ambil live di staging'), true, pg_temp.ts('2026-10-12 18:04')),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'freigabe', null, '{}',
    pg_temp.l('Entwurf 2 an Kundin gesendet', 'Draft 2 sent to client'), false, pg_temp.ts('2026-10-12 17:50')),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'build', null, '{}',
    pg_temp.l('Vitrine zeigt Restbestand', 'Display case shows remaining stock', 'Etalase menampilkan sisa stok'), true, pg_temp.ts('2026-10-09 11:20')),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'wunsch', null, '{}',
    pg_temp.l('Filter „glutenfrei“ · eingeplant', '“Gluten-free” filter · planned', 'Filter “bebas gluten” · dijadwalkan'), true, pg_temp.ts('2026-10-06 09:12')),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'zahlung', 'paid', '{"month":"2026-10","amount_cents":24900}', null, true, pg_temp.ts('2026-10-01 08:00')),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'datei', 'fileUploaded', '{"file":"schichten-herbst.xlsx"}', null, true, pg_temp.ts('2026-09-29 15:40')),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-c000-000000000002', 'ticket', null, '{}', pg_temp.l('Gutscheincode im Checkout', 'Voucher code at checkout'), true, pg_temp.ts('2026-10-10 10:00')),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-c000-000000000002', 'zahlung', 'paid', '{"month":"2026-10","amount_cents":24900}', null, true, pg_temp.ts('2026-10-01 08:00')),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-c000-000000000002', 'update', null, '{}', pg_temp.l('Drop-Seite Herbst live', 'Autumn drop page live'), true, pg_temp.ts('2026-09-22 12:00')),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-c000-000000000003', 'analyse', null, '{}', pg_temp.l('Abläufe Rezeption aufgenommen', 'Reception workflows mapped'), true, pg_temp.ts('2026-10-08 14:00')),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-c000-000000000003', 'vertrag', null, '{}', pg_temp.l('Whole system unterschrieben', 'Whole system signed'), true, pg_temp.ts('2026-10-02 10:00')),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-c000-000000000004', 'rechnung', null, '{}', pg_temp.l('September · 12 Tage offen', 'September · open 12 days'), false, pg_temp.ts('2026-10-01 08:00')),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-c000-000000000004', 'update', null, '{}', pg_temp.l('Warteliste automatisch', 'Automatic waiting list'), true, pg_temp.ts('2026-09-18 12:00')),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-c000-000000000004', 'zahlung', 'paid', '{"month":"2026-08","amount_cents":14900}', null, true, pg_temp.ts('2026-09-01 08:00')),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-c000-000000000005', 'build', null, '{}', pg_temp.l('Aufmaß-App mit Fotos', 'Site survey app with photos'), true, pg_temp.ts('2026-10-11 16:00')),
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-c000-000000000006', 'build', null, '{}', pg_temp.l('Produktimport 1.284 Teile', 'Product import 1,284 items'), true, pg_temp.ts('2026-10-09 10:00')),
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-c000-000000000006', 'zahlung', 'paid', '{"month":"2026-10","amount_cents":24900}', null, true, pg_temp.ts('2026-10-01 08:00')),
  ('00000000-0000-4000-b000-000000000007', null, 'anfrage', null, '{}', pg_temp.l('Über die Website, Shop + Buchung', 'Via the website, shop + booking'), false, pg_temp.ts('2026-10-07 19:00'));

-- ── offer for the lead Laden Mitte ────────────────────────────────────
insert into public.offers (org_id, number, package, setup_net_cents, monthly_net_cents, term_months, status, sent_at) values
  ('00000000-0000-4000-b000-000000000008', 'A-2026-012', 'growth', 199000, 24900, 12, 'sent', pg_temp.ts('2026-10-13 08:00'));
insert into public.doc_counters (prefix, year, last) values ('A', 2026, 12), ('R', 2026, 50);

-- ── invoices (net cents; VAT is computed) ─────────────────────────────
insert into public.invoices (number, org_id, kind, description, net_cents, status, allow_stripe, allow_bank, issued_on, service_from, service_to, due_on, paid_at, paid_via) values
  ('R-2026-031', '00000000-0000-4000-b000-000000000001', 'once', pg_temp.l('Setup Growth', 'Growth setup', 'Setup Growth'), 199000, 'paid', true, true, pg_temp.d('2026-09-02'), pg_temp.d('2026-09-02'), pg_temp.d('2026-09-02'), pg_temp.d('2026-09-16'), pg_temp.ts('2026-09-05 10:00'), 'stripe'),
  ('R-2026-033', '00000000-0000-4000-b000-000000000001', 'subscription', pg_temp.l('Growth · September', 'Growth · September', 'Growth · September'), 24900, 'paid', true, false, pg_temp.d('2026-09-01'), pg_temp.d('2026-09-01'), pg_temp.d('2026-09-30'), pg_temp.d('2026-09-15'), pg_temp.ts('2026-09-01 08:00'), 'stripe'),
  ('R-2026-036', '00000000-0000-4000-b000-000000000004', 'subscription', pg_temp.l('Core · September'), 14900, 'overdue', true, false, pg_temp.d('2026-09-17'), pg_temp.d('2026-09-01'), pg_temp.d('2026-09-30'), pg_temp.d('2026-10-01'), null, null),
  ('R-2026-041', '00000000-0000-4000-b000-000000000001', 'subscription', pg_temp.l('Growth · Oktober', 'Growth · October', 'Growth · Oktober'), 24900, 'paid', true, false, pg_temp.d('2026-10-01'), pg_temp.d('2026-10-01'), pg_temp.d('2026-10-31'), pg_temp.d('2026-10-15'), pg_temp.ts('2026-10-01 08:00'), 'stripe'),
  ('R-2026-042', '00000000-0000-4000-b000-000000000002', 'subscription', pg_temp.l('Growth · Oktober', 'Growth · October', 'Growth · Oktober'), 24900, 'paid', true, false, pg_temp.d('2026-10-01'), pg_temp.d('2026-10-01'), pg_temp.d('2026-10-31'), pg_temp.d('2026-10-15'), pg_temp.ts('2026-10-01 08:00'), 'stripe'),
  ('R-2026-043', '00000000-0000-4000-b000-000000000003', 'subscription', pg_temp.l('Whole system · Oktober'), 44900, 'open', true, false, pg_temp.d('2026-10-01'), pg_temp.d('2026-10-01'), pg_temp.d('2026-10-31'), pg_temp.d('2026-10-15'), null, null),
  ('R-2026-044', '00000000-0000-4000-b000-000000000005', 'subscription', pg_temp.l('Core · Oktober'), 14900, 'open', true, false, pg_temp.d('2026-10-01'), pg_temp.d('2026-10-01'), pg_temp.d('2026-10-31'), pg_temp.d('2026-10-15'), null, null),
  ('R-2026-045', '00000000-0000-4000-b000-000000000006', 'subscription', pg_temp.l('Growth · Oktober', 'Growth · October', 'Growth · Oktober'), 24900, 'paid', true, false, pg_temp.d('2026-10-01'), pg_temp.d('2026-10-01'), pg_temp.d('2026-10-31'), pg_temp.d('2026-10-15'), pg_temp.ts('2026-10-01 08:00'), 'stripe');

update public.invoices set item_id = '00000000-0000-4000-d000-000000000004' where number = 'R-2026-036';

-- ── pipeline ──────────────────────────────────────────────────────────
insert into public.leads (name, stage, next_step, next_at, potential_monthly_cents, org_id, contact_name, email) values
  ('Laden Mitte', 'analysis_done', pg_temp.l('Angebot senden', 'Send quote', 'Kirim penawaran'), null, 14900, '00000000-0000-4000-b000-000000000008', 'Nora Weiß', 'nora@laden-mitte.de'),
  ('Bäckerei Sommer', 'intro_call', null, pg_temp.ts('2026-10-15 10:30'), 14900, null, null, null),
  ('Physio am Markt', 'intro_call', null, pg_temp.ts('2026-10-16 14:00'), 24900, null, null, null),
  ('Weingut Berg', 'intro_call', null, pg_temp.ts('2026-10-17 09:00'), 44900, '00000000-0000-4000-b000-000000000007', 'Paul Berg', 'paul@weingut-berg.de');

-- ── email templates (DE source, EN from the designer; ID still missing) ─
insert into public.templates (key, kind, locale, name, subject, body, sort) values
  ('offer_core', 'angebot', 'de', 'Angebot · Core', 'Angebot · Core', E'Hallo {Vorname},\n\ndanke für das Gespräch am {Datum}. Wie besprochen schicke ich Ihnen das Angebot für Core: internes System mit KI, €149 im Monat, einmalig €1.290 Setup.\n\nDie Analyse liegt im Portal. Wenn alles passt, geben Sie das Angebot dort frei, dann starten wir in der Woche ab {Start}.\n\nViele Grüße\nRialto', 1),
  ('offer_core', 'angebot', 'en', 'Quote · Core', 'Quote · Core', E'Hi {Vorname},\n\nthanks for the call on {Datum}. As discussed, here is the quote for Core: internal system with AI, €149 a month, one-off €1,290 setup.\n\nThe analysis is in the portal. If everything fits, approve the quote there and we start in the week of {Start}.\n\nBest regards\nRialto', 1),
  ('offer_growth', 'angebot', 'de', 'Angebot · Growth', 'Angebot · Growth', E'Hallo {Vorname},\n\nhier ist Ihr Angebot für Growth: internes System, Team-App und Website oder Shop. €249 im Monat, einmalig €1.990 Setup, 12 Monate Laufzeit.\n\nAlles Weitere steht im Portal unter Dateien.\n\nViele Grüße\nRialto', 2),
  ('offer_growth', 'angebot', 'en', 'Quote · Growth', 'Quote · Growth', E'Hi {Vorname},\n\nhere is your quote for Growth: internal system, team app and website or shop. €249 a month, one-off €1,990 setup, 12-month term.\n\nEverything else is in the portal under Files.\n\nBest regards\nRialto', 2),
  ('approval_request', 'freigabe', 'de', 'Freigabe anfragen', 'Freigabe anfragen', E'Hallo {Vorname},\n\n{Element} ist fertig und liegt im Portal zur Freigabe. Ein Klick genügt, oder Sie schreiben mir, was anders sein soll.\n\nWenn Sie bis {Frist} freigeben, bleibt der Go-live am {Golive}.\n\nViele Grüße\nRialto', 3),
  ('approval_request', 'freigabe', 'en', 'Request approval', 'Request approval', E'Hi {Vorname},\n\n{Element} is ready and waiting for your approval in the portal. One click is enough, or tell me what should change.\n\nIf you approve by {Frist}, go-live stays on {Golive}.\n\nBest regards\nRialto', 3),
  ('payment_reminder', 'erinnerung', 'de', 'Zahlungserinnerung', 'Zahlungserinnerung', E'Hallo {Vorname},\n\nkurze Erinnerung: Die Rechnung {Nr} über {Betrag} ist seit {Tage} Tagen offen. Vielleicht ist sie untergegangen, das passiert.\n\nSie finden sie im Portal unter Rechnungen.\n\nDanke und viele Grüße\nRialto', 4),
  ('payment_reminder', 'erinnerung', 'en', 'Payment reminder', 'Payment reminder', E'Hi {Vorname},\n\na quick reminder: invoice {Nr} for {Betrag} has been open for {Tage} days. Maybe it got lost, that happens.\n\nYou''ll find it in the portal under Invoices.\n\nThanks and best regards\nRialto', 4),
  ('welcome', 'start', 'de', 'Willkommen im Portal', 'Willkommen im Portal', E'Hallo {Vorname},\n\nwillkommen bei RIDEFF. Ab heute finden Sie alles zu Ihrem Projekt an einem Ort: Stand, Freigaben, Dateien und Rechnungen.\n\nZum Anmelden reicht Ihre E-Mail-Adresse. Sie bekommen jedes Mal einen Code.\n\nBis bald\nRialto', 5),
  ('welcome', 'start', 'en', 'Welcome to the portal', 'Welcome to the portal', E'Hi {Vorname},\n\nwelcome to RIDEFF. From today, everything about your project is in one place: status, approvals, files and invoices.\n\nTo sign in, your email address is enough. You get a code each time.\n\nSee you soon\nRialto', 5),
  ('test_run_invite', 'start', 'de', 'Testlauf-Einladung', 'Testlauf-Einladung', E'Hallo {Vorname},\n\nder Testlauf für {System} ist am {Datum} um {Uhrzeit}, per Video, ca. 30 Minuten. Bringen Sie gern jemanden aus dem Team mit.\n\nDen Link bekommen Sie 10 Minuten vorher.\n\nViele Grüße\nRialto', 6),
  ('test_run_invite', 'start', 'en', 'Test run invite', 'Test run invite', E'Hi {Vorname},\n\nthe test run for {System} is on {Datum} at {Uhrzeit}, by video, about 30 minutes. Feel free to bring someone from the team.\n\nYou''ll get the link 10 minutes before.\n\nBest regards\nRialto', 6);

alter table public.items enable trigger items_notify;
alter table public.messages enable trigger messages_notify;
alter table public.invoices enable trigger invoices_notify;
alter table public.meetings enable trigger meetings_notify;
