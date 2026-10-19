-- Step 5: create client, convert lead, send quote, reminder, snoozes.
begin;

create function pg_temp.eq(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when insufficient_privilege or invalid_parameter_value or no_data_found then
    raise notice 'ok  % (denied: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
create function pg_temp.as_user(p_sub uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.eq(text, bigint, bigint), pg_temp.denied(text, text), pg_temp.as_user(uuid, text) to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000000000c1', 'kai@baeckerei-sommer.de', '{"full_name":"Kai Sommer"}'),
  ('00000000-0000-4000-a000-0000000000a3', 'finanzen@rideff.com', '{"full_name":"Test Finanzen"}');
insert into public.staff (user_id, role) values ('00000000-0000-4000-a000-0000000000a3', 'finanzen');

-- Finanzen cannot create clients
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a3');
select pg_temp.denied('finanzen cannot create clients', $$select public.create_client_org('00000000-0000-4000-a000-0000000000c1', 'Bäckerei Sommer', 'Kai Sommer', 'kai@baeckerei-sommer.de', 'Kassel', 'core')$$);
reset role;

-- owner creates a new client
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select public.create_client_org('00000000-0000-4000-a000-0000000000c1', 'Bäckerei Sommer', 'Kai Sommer', 'kai@baeckerei-sommer.de', 'Kassel', 'core');
select pg_temp.eq('org created with slug', (select count(*) from public.organizations where slug = 'backerei-sommer' and status = 'client' and package = 'core'), 1);
select pg_temp.eq('contact is Inhaber', (select count(*) from public.org_members m join public.organizations o on o.id = m.org_id where o.slug = 'backerei-sommer' and m.role = 'inhaber'), 1);
select pg_temp.eq('project in phase 2 with a chat thread', (select count(*) from public.projects p join public.threads t on t.project_id = p.id join public.organizations o on o.id = p.org_id where o.slug = 'backerei-sommer' and p.phase = 2), 1);
select public.create_client_org('00000000-0000-4000-a000-0000000000c1', 'Bäckerei Sommer', 'Kai Sommer', 'kai@baeckerei-sommer.de', 'Kassel', 'core');
select pg_temp.eq('second org with the same name gets -2', (select count(*) from public.organizations where slug = 'backerei-sommer-2'), 1);

-- convert the lead Laden Mitte (Nora already has a login)
select public.create_client_org('00000000-0000-4000-a000-000000000201', 'Laden Mitte', 'Nora Weiß', 'nora@laden-mitte.de', '', 'growth',
  '00000000-0000-4000-b000-000000000008', false);
select pg_temp.eq('lead becomes client', (select count(*) from public.organizations where id = '00000000-0000-4000-b000-000000000008' and status = 'client' and since is not null), 1);
select pg_temp.eq('converted lead gets one project', (select count(*) from public.projects where org_id = '00000000-0000-4000-b000-000000000008'), 1);
select pg_temp.eq('pipeline shows it accepted', (select count(*) from public.leads where org_id = '00000000-0000-4000-b000-000000000008' and stage = 'accepted'), 1);

-- send a draft quote
insert into public.offers (id, org_id, number, package, setup_net_cents, monthly_net_cents)
values ('00000000-0000-4000-f000-0000000000d1', '00000000-0000-4000-b000-000000000007', 'A-2026-013', 'whole_system', 390000, 44900);
select public.send_offer('00000000-0000-4000-f000-0000000000d1');
select pg_temp.eq('quote sent', (select count(*) from public.offers where number = 'A-2026-013' and status = 'sent' and sent_at is not null), 1);
select pg_temp.denied('cannot send twice', $$select public.send_offer('00000000-0000-4000-f000-0000000000d1')$$);

-- reminder
select public.remind_invoice((select id from public.invoices where number = 'R-2026-036'));
select pg_temp.eq('reminder stored', (select count(*) from public.invoices where number = 'R-2026-036' and reminded_at is not null), 1);

-- snoozes are per person
insert into public.queue_snoozes (staff_id, key, until) values (auth.uid(), 'invoice:x', now() + interval '1 day');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a3');
select pg_temp.eq('snoozes are private', (select count(*) from public.queue_snoozes), 0);
select pg_temp.denied('snooze as someone else', $$insert into public.queue_snoozes (staff_id, key, until) values ('00000000-0000-4000-a000-000000000001', 'y', now())$$);
reset role;

rollback;
