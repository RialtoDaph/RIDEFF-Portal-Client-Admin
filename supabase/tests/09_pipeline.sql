-- Step 8.8: leads are Support's (and the owner's).
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000000000a2', 'support@rideff.com', '{"full_name":"Test Support"}'),
  ('00000000-0000-4000-a000-0000000000a4', 'builder@rideff.com', '{"full_name":"Test Builder"}');
insert into public.staff (user_id, role) values
  ('00000000-0000-4000-a000-0000000000a2', 'support'),
  ('00000000-0000-4000-a000-0000000000a4', 'builder');
create function pg_temp.as_user(p_sub uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', 'aal2')::text, true);
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
grant execute on function pg_temp.as_user(uuid), pg_temp.eq(text, bigint, bigint), pg_temp.affected(text) to authenticated;

select pg_temp.as_user('00000000-0000-4000-a000-0000000000a2');
insert into public.leads (name, phone, source, next_at) values ('Blumen Krause', '+49 30 123', 'Empfehlung', now() + interval '2 days');
select pg_temp.eq('support adds a lead', (select count(*) from public.leads where name = 'Blumen Krause'), 1);
select pg_temp.eq('support marks it lost', pg_temp.affected($q$update public.leads set stage = 'lost', lost_reason = 'Kein Budget' where name = 'Blumen Krause'$q$), 1);
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-0000000000a4');
select pg_temp.eq('builder sees no leads', (select count(*) from public.leads), 0);
select pg_temp.eq('builder cannot move a lead', pg_temp.affected($q$update public.leads set stage = 'offer_sent'$q$), 0);
reset role;
rollback;
