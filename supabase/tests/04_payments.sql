-- Step 4: transfer announcement, Stripe booking, monthly cycle, manual confirmation.
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
create function pg_temp.as_user(p_sub uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.eq(text, bigint, bigint), pg_temp.denied(text, text), pg_temp.as_user(uuid, text) to authenticated, service_role;

-- a one-time invoice for Café Linde that allows transfer
insert into public.invoices (id, number, org_id, kind, description, net_cents, allow_stripe, allow_bank, service_from)
values ('00000000-0000-4000-f000-000000000001', 'R-2026-900', '00000000-0000-4000-b000-000000000001', 'once', '{"de":"Extra"}', 10000, true, true, '2026-10-19');

select pg_temp.as_user('00000000-0000-4000-a000-000000000102');
select pg_temp.denied('mitarbeiterin cannot announce', $$select public.announce_transfer('00000000-0000-4000-f000-000000000001')$$);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000101');
select pg_temp.denied('subscription cannot be paid by transfer', $$select public.announce_transfer((select id from public.invoices where number = 'R-2026-041'))$$);
select public.announce_transfer('00000000-0000-4000-f000-000000000001');
select pg_temp.eq('transfer announced', (select count(*) from public.invoices where number = 'R-2026-900' and status = 'announced'), 1);
select pg_temp.denied('client cannot confirm', $$select public.confirm_transfer('00000000-0000-4000-f000-000000000001')$$);
reset role;

-- support may not confirm money, finanzen may
select pg_temp.as_user('00000000-0000-4000-a000-000000000001', 'aal1');
select pg_temp.denied('owner without 2FA cannot confirm', $$select public.confirm_transfer('00000000-0000-4000-f000-000000000001')$$);
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001', 'aal2');
select public.confirm_transfer('00000000-0000-4000-f000-000000000001');
reset role;
select pg_temp.eq('confirmed as paid by bank', (select count(*) from public.invoices where number = 'R-2026-900' and status = 'paid' and paid_via = 'bank'), 1);
select pg_temp.eq('payment is logged', (select count(*) from public.activity_log where event = 'paid' and params ->> 'nr' = 'R-2026-900'), 1);

-- Stripe: first payment of a monthly invoice, then a later month
set local role authenticated;
select pg_temp.denied('browser cannot book Stripe payments', $$select public.stripe_mark_paid((select id from public.invoices where number = 'R-2026-043'), 'cs', 'pi', 'sub')$$);
reset role;
set local role service_role;
select pg_temp.eq('webhook books R-2026-043', (select public.stripe_mark_paid((select id from public.invoices where number = 'R-2026-043'), 'cs_1', 'pi_1', 'sub_1')::int), 1);
select pg_temp.eq('retry is a no-op', (select public.stripe_mark_paid((select id from public.invoices where number = 'R-2026-043'), 'cs_1', 'pi_1', 'sub_1')::int), 0);
select pg_temp.eq('November invoice created', (select (public.stripe_record_cycle('sub_1', 'in_2', 'pi_2', '2026-11-01', '2026-11-30') = 'R-2026-051')::int), 1);
select pg_temp.eq('same Stripe invoice twice gives the same number', (select (public.stripe_record_cycle('sub_1', 'in_2', 'pi_2', '2026-11-01', '2026-11-30') = 'R-2026-051')::int), 1);
reset role;
select pg_temp.eq('November is paid, Whole system · November', (select count(*) from public.invoices where number = 'R-2026-051' and status = 'paid'
  and description ->> 'de' = 'Whole system · November' and description ->> 'en' = 'Whole system · November' and net_cents = 44900), 1);

-- the client sees the bank details, not other settings
select pg_temp.as_user('00000000-0000-4000-a000-000000000101');
select pg_temp.eq('client reads seller and bank only', (select count(*) from public.settings), 2);
reset role;

rollback;
