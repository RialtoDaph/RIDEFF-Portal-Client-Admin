-- Step 6: creating invoices from admin.
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

insert into auth.users (id, email) values ('00000000-0000-4000-a000-0000000000a2', 'support@rideff.com');
insert into public.staff (user_id, role) values ('00000000-0000-4000-a000-0000000000a2', 'support');

select pg_temp.as_user('00000000-0000-4000-a000-0000000000a2');
select pg_temp.denied('support cannot invoice', $$select public.create_invoice('00000000-0000-4000-b000-000000000001', 'once', 'Extra', 10000, true, true)$$);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000101', 'aal1');
select pg_temp.denied('client cannot invoice', $$select public.create_invoice('00000000-0000-4000-b000-000000000001', 'once', 'Extra', 10000, true, true)$$);
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select pg_temp.eq('owner creates R-2026-051', (select (public.create_invoice('00000000-0000-4000-b000-000000000001', 'once', 'Fotoshooting', 45000, true, true) = 'R-2026-051')::int), 1);
select pg_temp.eq('monthly forces Stripe and no transfer', (select (public.create_invoice('00000000-0000-4000-b000-000000000001', 'subscription', 'Zusatzmodul', 5000, false, true) = 'R-2026-052')::int), 1);
select pg_temp.eq('subscription stored as stripe-only', (select count(*) from public.invoices where number = 'R-2026-052' and allow_stripe and not allow_bank), 1);
select pg_temp.denied('zero amount refused', $$select public.create_invoice('00000000-0000-4000-b000-000000000001', 'once', 'X', 0, true, true)$$);
select pg_temp.denied('no method refused', $$select public.create_invoice('00000000-0000-4000-b000-000000000001', 'once', 'X', 100, false, false)$$);
reset role;
select pg_temp.eq('client log shows the new invoice', (select count(*) from public.activity_log where event = 'invoiceCreated' and client_visible), 2);
rollback;
