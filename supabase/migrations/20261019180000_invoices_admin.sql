-- Step 6 · "+ RECHNUNG ERSTELLEN": one-time or monthly invoice for a client (Finanzen and owner).
-- Monthly invoices are paid through a Stripe subscription only, never by transfer.
create function public.create_invoice(
  p_org uuid, p_kind public.invoice_kind, p_description text, p_net_cents integer, p_allow_stripe boolean, p_allow_bank boolean
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  nr text;
  term integer;
  bank boolean := p_allow_bank and p_kind = 'once';
  stripe boolean := p_allow_stripe or p_kind = 'subscription';
begin
  if not private.has_staff_role('finanzen') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(trim(coalesce(p_description, ''))) = 0 or length(p_description) > 200 then raise exception 'item required' using errcode = '22023'; end if;
  if coalesce(p_net_cents, 0) <= 0 or p_net_cents > 100000000 then raise exception 'invalid amount' using errcode = '22023'; end if;
  if not (stripe or bank) then raise exception 'no payment method' using errcode = '22023'; end if;
  if not exists (select 1 from public.organizations where id = p_org) then raise exception 'organisation not found' using errcode = 'P0002'; end if;
  select coalesce((value #>> '{}')::integer, 14) into term from public.settings where key = 'payment_term_days';
  nr := public.next_doc_number('R');
  insert into public.invoices (number, org_id, kind, description, net_cents, allow_stripe, allow_bank, issued_on, service_from, service_to, due_on)
  values (
    nr, p_org, p_kind, jsonb_build_object('de', trim(p_description)), p_net_cents, stripe, bank, current_date, current_date,
    case when p_kind = 'subscription' then (current_date + interval '1 month' - interval '1 day')::date else current_date end,
    current_date + coalesce(term, 14)
  );
  insert into public.activity_log (org_id, actor_id, tag, event, params, client_visible)
  values (p_org, auth.uid(), 'rechnung', 'invoiceCreated', jsonb_build_object('nr', nr, 'amount_cents', p_net_cents), true);
  return nr;
end $$;
revoke execute on function public.create_invoice(uuid, public.invoice_kind, text, integer, boolean, boolean) from public, anon;
grant execute on function public.create_invoice(uuid, public.invoice_kind, text, integer, boolean, boolean) to authenticated;
