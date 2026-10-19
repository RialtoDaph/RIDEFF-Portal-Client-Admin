-- Step 8.6: phase and progress, new projects, test-run subject.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000000000a3', 'finanzen@rideff.com', '{"full_name":"Test Finanzen"}'),
  ('00000000-0000-4000-a000-0000000000a4', 'builder@rideff.com', '{"full_name":"Test Builder"}');
insert into public.staff (user_id, role) values
  ('00000000-0000-4000-a000-0000000000a3', 'finanzen'),
  ('00000000-0000-4000-a000-0000000000a4', 'builder');

create function pg_temp.as_user(p_sub uuid, p_aal text default 'aal2') returns void language plpgsql as $$
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
  exception when insufficient_privilege then
    raise notice 'ok  % (denied)', label;
    return;
  end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
grant execute on function pg_temp.as_user(uuid, text), pg_temp.eq(text, bigint, bigint), pg_temp.denied(text, text) to authenticated;

-- builder: progress, live, new project
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a4');
select public.set_project_progress('00000000-0000-4000-c000-000000000006', 5::smallint, 100::smallint, current_date);
reset role;
select pg_temp.eq('phase 05 is stored', (select count(*) from public.projects where id = '00000000-0000-4000-c000-000000000006' and phase = 5 and progress_pct = 100), 1);
select pg_temp.eq('phase 05 marks the client live', (select count(*) from public.organizations o join public.projects p on p.org_id = o.id where p.id = '00000000-0000-4000-c000-000000000006' and o.live_since is not null), 1);
select pg_temp.eq('phase change notifies', (select count(*) from public.notifications where kind = 'phase_change'), 1);

select pg_temp.as_user('00000000-0000-4000-a000-0000000000a4');
select public.create_project('00000000-0000-4000-b000-000000000001', 'Online-Shop');
reset role;
select pg_temp.eq('new project with its chat thread', (select count(*) from public.projects p join public.threads t on t.project_id = p.id and t.item_id is null where p.name = 'Online-Shop'), 1);

-- finanzen and clients cannot
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a3');
select pg_temp.denied('finanzen cannot set progress', $q$select public.set_project_progress('00000000-0000-4000-c000-000000000001', 4::smallint, 10::smallint, null)$q$);
select pg_temp.denied('finanzen cannot create projects', $q$select public.create_project('00000000-0000-4000-b000-000000000001', 'X')$q$);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000101');
select pg_temp.denied('Inhaber cannot set progress', $q$select public.set_project_progress('00000000-0000-4000-c000-000000000001', 4::smallint, 10::smallint, null)$q$);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a4', 'aal1');
select pg_temp.denied('builder without 2FA cannot', $q$select public.create_project('00000000-0000-4000-b000-000000000001', 'X')$q$);
reset role;

-- test run: the invite names the subject, not the portal title
insert into public.meetings (project_id, starts_at, kind, title, subject)
values ('00000000-0000-4000-c000-000000000005', now() + interval '2 days', 'test_run', '{"de":"Testlauf Aufmaß-App · Video"}', '{"de":"Aufmaß-App"}');
select pg_temp.eq('invite uses the subject', (select count(*) from public.notifications where kind = 'test_run_invite' and params -> 'title' ->> 'de' = 'Aufmaß-App'), 1);

rollback;
