-- Step 8: client team rules, recovery codes, weekly summary over all projects.
begin;
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
create function pg_temp.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
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
grant execute on function pg_temp.as_user(uuid, text), pg_temp.eq(text, bigint, bigint), pg_temp.affected(text), pg_temp.denied(text, text) to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-a000-000000000199', 'neu@cafe-linde.de', '{"full_name":"Neu Linde"}');

-- Lena (Inhaber of Café Linde) manages her team
select pg_temp.as_user('00000000-0000-4000-a000-000000000101');
insert into public.org_members (org_id, user_id, role) values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000199', 'mitarbeiter');
select pg_temp.eq('Inhaber adds a member', (select count(*) from public.org_members where user_id = '00000000-0000-4000-a000-000000000199'), 1);
select pg_temp.eq('Inhaber promotes the member', pg_temp.affected($q$update public.org_members set role = 'inhaber' where user_id = '00000000-0000-4000-a000-000000000199'$q$), 1);
select pg_temp.eq('Inhaber cannot change herself', pg_temp.affected($q$update public.org_members set role = 'mitarbeiter' where user_id = '00000000-0000-4000-a000-000000000101'$q$), 0);
select pg_temp.eq('Inhaber cannot remove herself', pg_temp.affected($q$delete from public.org_members where user_id = '00000000-0000-4000-a000-000000000101'$q$), 0);
select pg_temp.eq('Inhaber removes the member', pg_temp.affected($q$delete from public.org_members where user_id = '00000000-0000-4000-a000-000000000199'$q$), 1);
select pg_temp.denied('Inhaber cannot add to another org', $q$insert into public.org_members (org_id, user_id, role) values ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000199', 'inhaber')$q$);
reset role;

-- Mia (Mitarbeiterin) cannot manage the team
select pg_temp.as_user('00000000-0000-4000-a000-000000000102');
select pg_temp.denied('Mitarbeiter cannot add members', $q$insert into public.org_members (org_id, user_id, role) values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000199', 'mitarbeiter')$q$);
select pg_temp.eq('Mitarbeiter cannot remove the Inhaber', pg_temp.affected($q$delete from public.org_members where user_id = '00000000-0000-4000-a000-000000000101'$q$), 0);
reset role;

-- recovery codes (owner)
select pg_temp.as_user('00000000-0000-4000-a000-000000000001', 'aal1');
select pg_temp.denied('codes need 2FA first', $q$select public.set_recovery_codes(array_fill(repeat('a', 64), array[10]))$q$);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001', 'aal2');
select public.set_recovery_codes(array(select encode(sha256(('code' || g)::bytea), 'hex') from generate_series(1, 10) g));
select pg_temp.eq('ten codes left', public.recovery_codes_left(), 10);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001', 'aal1');
select pg_temp.eq('a code works once', (select public.consume_recovery_code(encode(sha256('code3'::bytea), 'hex')))::int, 1);
select pg_temp.eq('not twice', (select public.consume_recovery_code(encode(sha256('code3'::bytea), 'hex')))::int, 0);
select pg_temp.eq('nine left', public.recovery_codes_left(), 9);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000101', 'aal1');
select pg_temp.eq('clients have no codes', (select public.consume_recovery_code(encode(sha256('code4'::bytea), 'hex')))::int, 0);
reset role;

-- weekly summary lists every project
insert into public.projects (org_id, name, phase, progress_pct) values ('00000000-0000-4000-b000-000000000001', 'Online-Shop', 2, 10);
select public.run_weekly_summary();
select pg_temp.eq('Lena gets both projects', (select jsonb_array_length(params -> 'projects') from public.notifications where kind = 'weekly_summary' and user_id = '00000000-0000-4000-a000-000000000101'), 2);
rollback;
