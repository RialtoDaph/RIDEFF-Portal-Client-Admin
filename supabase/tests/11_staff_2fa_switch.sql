-- 2FA switch: staff without TOTP pass only while the owner has made it optional.
begin;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-a000-0000000000a4', 'builder@rideff.com', '{"full_name":"Test Builder"}');
insert into public.staff (user_id, role) values ('00000000-0000-4000-a000-0000000000a4', 'builder');
create function pg_temp.as_user(p_sub uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.eq(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
grant execute on function pg_temp.as_user(uuid, text), pg_temp.eq(text, bigint, bigint) to authenticated;

select pg_temp.as_user('00000000-0000-4000-a000-0000000000a4', 'aal1');
select pg_temp.eq('without TOTP: no projects by default', (select count(*) from public.projects), 0);
reset role;
insert into public.settings (key, value) values ('require_staff_2fa', 'false') on conflict (key) do update set value = excluded.value;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a4', 'aal1');
select pg_temp.eq('2FA optional: projects visible', (select count(*) from public.projects), 6);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000101', 'aal1');
select pg_temp.eq('clients unaffected', (select count(*) from public.projects), 1);
reset role;
rollback;
