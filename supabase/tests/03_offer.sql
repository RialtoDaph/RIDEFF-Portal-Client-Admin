-- Step 3: quote acceptance (called by the server with the service role).
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
grant execute on function pg_temp.eq(text, bigint, bigint), pg_temp.denied(text, text) to authenticated, service_role;

-- a signed-in user cannot call it, even the Inhaber
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000201","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.denied('browser cannot accept directly', $$select public.accept_offer((select id from public.offers limit 1), auth.uid(), '1.2.3.4', 'x', '2026-10', 'p', repeat('a', 64))$$);
reset role;

set local role service_role;
select pg_temp.denied('a Mitarbeiterin of another org cannot accept', $$select public.accept_offer((select id from public.offers where number = 'A-2026-012'), '00000000-0000-4000-a000-000000000102', '1.2.3.4', 'x', '2026-10', 'p', repeat('a', 64))$$);
select pg_temp.denied('unknown AGB version', $$select public.accept_offer((select id from public.offers where number = 'A-2026-012'), '00000000-0000-4000-a000-000000000201', '1.2.3.4', 'x', '1999', 'p', repeat('a', 64))$$);
select pg_temp.eq('nora accepts and gets R-2026-051',
  (select (public.accept_offer((select id from public.offers where number = 'A-2026-012'), '00000000-0000-4000-a000-000000000201',
     '203.0.113.7', 'Mozilla/5.0', '2026-10', 'org/offer/hash.pdf', repeat('b', 64)) = 'R-2026-051')::int), 1);
select pg_temp.denied('cannot accept twice', $$select public.accept_offer((select id from public.offers where number = 'A-2026-012'), '00000000-0000-4000-a000-000000000201', '1.2.3.4', 'x', '2026-10', 'p', repeat('a', 64))$$);
reset role;

select pg_temp.eq('audit fields stored', (select count(*) from public.offers where number = 'A-2026-012' and status = 'accepted'
  and accepted_ip = '203.0.113.7' and accepted_by = '00000000-0000-4000-a000-000000000201' and agb_version = '2026-10'
  and snapshot_pdf_hash = repeat('b', 64) and accepted_at is not null), 1);
select pg_temp.eq('setup invoice €1.990 + 19 %', (select gross_cents from public.invoices where number = 'R-2026-051' and kind = 'once' and allow_bank and allow_stripe), 236810);
select pg_temp.eq('invoice due in 14 days', (select (due_on - issued_on) from public.invoices where number = 'R-2026-051'), 14);
select pg_temp.eq('lead moves to accepted', (select count(*) from public.leads where name = 'Laden Mitte' and stage = 'accepted'), 1);
select pg_temp.eq('team is notified', (select count(*) from public.notifications where kind = 'approval_new'), 1);
select pg_temp.eq('contract is logged', (select count(*) from public.activity_log where event = 'offerAccepted'), 1);

-- the lead now sees the invoice
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000201","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.eq('nora sees the setup invoice', (select count(*) from public.invoices), 1);
reset role;

rollback;
