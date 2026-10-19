-- Row-level security checks against the seed data.
-- Plain SQL (no pgTAP) so it runs on any Postgres; every check raises on failure.
begin;

-- two extra team members to test role limits
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000000000a2', 'support@rideff.com', '{"full_name":"Test Support"}'),
  ('00000000-0000-4000-a000-0000000000a3', 'finanzen@rideff.com', '{"full_name":"Test Finanzen"}'),
  ('00000000-0000-4000-a000-0000000000a4', 'builder@rideff.com', '{"full_name":"Test Builder"}');
insert into public.staff (user_id, role) values
  ('00000000-0000-4000-a000-0000000000a2', 'support'),
  ('00000000-0000-4000-a000-0000000000a3', 'finanzen'),
  ('00000000-0000-4000-a000-0000000000a4', 'builder');

create function pg_temp.as_user(p_sub uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.eq(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when insufficient_privilege or check_violation then
    raise notice 'ok  % (denied)', label;
    return;
  end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
create function pg_temp.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function pg_temp.affected(text) to authenticated, anon;
grant execute on function pg_temp.as_user(uuid, text), pg_temp.eq(text, bigint, bigint), pg_temp.denied(text, text) to authenticated, anon;

-- ── Lena, Inhaber of Café Linde ───────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-000000000101');
select pg_temp.eq('lena sees one org', (select count(*) from public.organizations), 1);
select pg_temp.eq('lena sees her 3 invoices', (select count(*) from public.invoices), 3);
select pg_temp.eq('lena sees 1 project', (select count(*) from public.projects), 1);
select pg_temp.eq('lena sees 6 files', (select count(*) from public.files), 6);
select pg_temp.eq('lena sees only Linde messages', (select count(*) from public.messages), 2);
select pg_temp.eq('lena sees no offers of other orgs', (select count(*) from public.offers), 0);
select pg_temp.eq('lena log hides team-only entries', (select count(*) from public.activity_log), 5);
select pg_temp.eq('lena sees no staff rows', (select count(*) from public.staff), 0);
select pg_temp.eq('lena sees Rialto''s name', (select count(*) from public.profiles where id = '00000000-0000-4000-a000-000000000001'), 1);
select pg_temp.eq('lena cannot see other clients', (select count(*) from public.profiles where id = '00000000-0000-4000-a000-000000000201'), 0);
select pg_temp.eq('lena cannot mark an invoice paid', pg_temp.affected($q$update public.invoices set status = 'paid'$q$), 0);
select pg_temp.eq('lena cannot approve items directly', pg_temp.affected($q$update public.items set status = 'approved'$q$), 0);
select pg_temp.eq('lena sees no templates', (select count(*) from public.templates), 0);
select pg_temp.eq('lena sees no leads', (select count(*) from public.leads), 0);
select pg_temp.denied('lena cannot change her email', $$update public.profiles set email = 'x@y.de' where id = auth.uid()$$);
select pg_temp.denied('lena cannot draw invoice numbers', $$select public.next_doc_number('R')$$);
update public.profiles set locale = 'en' where id = auth.uid();
select pg_temp.eq('lena can change her language', (select count(*) from public.profiles where id = auth.uid() and locale = 'en'), 1);
insert into public.messages (thread_id, author_id, body)
  values ('00000000-0000-4000-e000-000000000001', auth.uid(), 'Test');
select pg_temp.eq('lena can chat in her thread', (select count(*) from public.messages), 3);
select pg_temp.denied('lena cannot post as Rialto', $$insert into public.messages (thread_id, author_id, body) values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001', 'x')$$);
select pg_temp.denied('lena cannot post into another org', $$insert into public.messages (thread_id, author_id, body) values ('00000000-0000-4000-e000-000000000003', auth.uid(), 'x')$$);
insert into public.files (project_id, storage_path, name, size_bytes, uploaded_by)
  values ('00000000-0000-4000-c000-000000000001', 'test/lena.pdf', 'lena', 1, auth.uid());
select pg_temp.eq('lena can add a file', (select count(*) from public.files), 7);
reset role;

-- ── Mia, Mitarbeiterin of Café Linde ──────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-000000000102');
select pg_temp.eq('mia sees the invoices', (select count(*) from public.invoices), 3);
insert into public.files (project_id, storage_path, name, size_bytes, uploaded_by) values ('00000000-0000-4000-c000-000000000001', 'test/mia.pdf', 'mia', 1, auth.uid());
select pg_temp.eq('mia can upload', (select count(*) from public.files where uploaded_by = auth.uid()), 1);
insert into public.messages (thread_id, author_id, body)
  values ('00000000-0000-4000-e000-000000000001', auth.uid(), 'Mia schreibt');
select pg_temp.eq('mia can chat', (select count(*) from public.messages where author_id = auth.uid()), 1);
reset role;

-- ── Nora, lead Laden Mitte ────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-000000000201');
select pg_temp.eq('nora sees her sent offer', (select count(*) from public.offers), 1);
select pg_temp.eq('nora sees no invoices yet', (select count(*) from public.invoices), 0);
select pg_temp.eq('nora cannot accept the offer directly', pg_temp.affected($q$update public.offers set status = 'accepted'$q$), 0);
reset role;

-- ── Rialto, owner: nothing before 2FA, everything after ──────────────
select pg_temp.as_user('00000000-0000-4000-a000-000000000001', 'aal1');
select pg_temp.eq('owner aal1 sees own staff row', (select count(*) from public.staff), 1);
select pg_temp.eq('owner aal1 sees no orgs', (select count(*) from public.organizations), 0);
select pg_temp.eq('owner aal1 sees no invoices', (select count(*) from public.invoices), 0);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001', 'aal2');
select pg_temp.eq('owner sees all orgs', (select count(*) from public.organizations), 8);
select pg_temp.eq('owner sees all invoices', (select count(*) from public.invoices), 8);
select pg_temp.eq('owner sees all staff', (select count(*) from public.staff), 4);
select pg_temp.eq('owner sees team-only log', (select count(*) from public.activity_log where not client_visible), 3);
select pg_temp.eq('owner can update a project', pg_temp.affected($q$update public.projects set progress_pct = 63 where id = '00000000-0000-4000-c000-000000000001'$q$), 1);
reset role;

-- ── support: clients, chat, files; no invoices ───────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a2', 'aal2');
select pg_temp.eq('support sees orgs', (select count(*) from public.organizations), 8);
select pg_temp.eq('support sees no invoices', (select count(*) from public.invoices), 0);
select pg_temp.eq('support sees threads', (select count(*) from public.threads), 11);
select pg_temp.eq('support sees leads', (select count(*) from public.leads), 4);
select pg_temp.eq('support cannot edit staff', pg_temp.affected($q$update public.staff set role = 'owner'$q$), 0);
reset role;

-- ── finanzen: invoices only ───────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a3', 'aal2');
select pg_temp.eq('finanzen sees invoices', (select count(*) from public.invoices), 8);
select pg_temp.eq('finanzen sees no projects', (select count(*) from public.projects), 0);
select pg_temp.eq('finanzen sees no messages', (select count(*) from public.messages), 0);
select pg_temp.eq('finanzen sees no files', (select count(*) from public.files), 0);
select pg_temp.eq('finanzen sees client names', (select count(*) from public.organizations), 8);
reset role;

-- ── builder: phase, files, chat; no invoices, no leads ───────────────
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a4', 'aal2');
select pg_temp.eq('builder sees projects', (select count(*) from public.projects), 6);
select pg_temp.eq('builder sees no invoices', (select count(*) from public.invoices), 0);
select pg_temp.eq('builder sees no leads', (select count(*) from public.leads), 0);
select pg_temp.eq('builder can move a phase', pg_temp.affected($q$update public.projects set phase = 4 where id = '00000000-0000-4000-c000-000000000006'$q$), 1);
reset role;

-- ── anonymous: nothing ───────────────────────────────────────────────
set local role anon;
select pg_temp.denied('anon cannot read orgs', $$select count(*) from public.organizations$$);
reset role;

-- ── data rules ────────────────────────────────────────────────────────
select pg_temp.eq('VAT is 19 % of net', (select gross_cents from public.invoices where number = 'R-2026-031'), 236810);
select pg_temp.denied('subscriptions cannot allow transfer', $$insert into public.invoices (number, org_id, kind, description, net_cents, allow_stripe, allow_bank) values ('R-2026-999', '00000000-0000-4000-b000-000000000001', 'subscription', '{"de":"x"}', 100, true, true)$$);
select pg_temp.denied('accepted offers need the audit fields', $$update public.offers set status = 'accepted'$$);
select pg_temp.eq('invoice numbers continue at R-2026-051', (select (public.next_doc_number('R', date '2026-10-19') = 'R-2026-051')::int), 1);

rollback;
