-- Step 4 · payments. Stripe webhooks are the source of truth for "paid";
-- a bank transfer is announced by the client and confirmed by the team.

-- Billing address of the client (§14 UStG: name and address of the recipient).
alter table public.organizations
  add column street text,
  add column postal_code text,
  add column country text not null default 'DE';

-- Seller and bank details for invoices and the transfer option.
-- PLACEHOLDERS until the owner provides the real data.
insert into public.settings (key, value) values
  ('seller', '{"name": "Rialto Effendy · RIDEFF", "street": "[STRASSE]", "city": "[PLZ ORT]", "country": "Deutschland", "taxId": "[STEUERNUMMER ODER USt-IdNr.]", "email": "hallo@rideff.com"}'),
  ('bank', '{"recipient": "Rialto Effendy", "iban": "[IBAN]", "bic": "[BIC]", "bank": "[BANK]"}')
on conflict (key) do nothing;
-- members need the bank details for the transfer option and the seller block of their invoices
create policy settings_billing_read on public.settings for select to authenticated using (key in ('seller', 'bank'));

-- ── client: announce a transfer ───────────────────────────────────────
create function public.announce_transfer(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  iv public.invoices%rowtype;
begin
  select * into iv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found' using errcode = 'P0002'; end if;
  if not private.is_inhaber(iv.org_id) then raise exception 'only the Inhaber can pay' using errcode = '42501'; end if;
  if not iv.allow_bank then raise exception 'transfer not allowed for this invoice' using errcode = '22023'; end if;
  if iv.status not in ('open', 'overdue') then raise exception 'invoice is not open' using errcode = '22023'; end if;
  update public.invoices set status = 'announced', announced_at = now() where id = p_invoice;
end $$;
revoke execute on function public.announce_transfer(uuid) from public, anon;
grant execute on function public.announce_transfer(uuid) to authenticated;

-- ── paid: one place that books it ─────────────────────────────────────
create function private.book_paid(p_invoice uuid, p_via public.payment_method, p_actor uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  iv public.invoices%rowtype;
begin
  select * into iv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found' using errcode = 'P0002'; end if;
  if iv.status = 'paid' then return false; end if; -- webhooks retry: stay idempotent
  update public.invoices set status = 'paid', paid_at = now(), paid_via = p_via where id = p_invoice;
  insert into public.activity_log (org_id, actor_id, tag, event, params)
  values (iv.org_id, p_actor, 'zahlung', 'paid',
          jsonb_build_object('month', to_char(coalesce(iv.service_from, iv.issued_on), 'YYYY-MM'), 'amount_cents', iv.net_cents, 'nr', iv.number));
  return true;
end $$;
revoke all on function private.book_paid(uuid, public.payment_method, uuid) from public, anon, authenticated;

-- Stripe webhook (service role): Checkout completed or async SEPA payment succeeded.
create function public.stripe_mark_paid(p_invoice uuid, p_session text, p_payment_intent text, p_subscription text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.invoices set
    stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_session),
    stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent),
    stripe_subscription_id = coalesce(stripe_subscription_id, p_subscription)
  where id = p_invoice;
  return private.book_paid(p_invoice, 'stripe', null);
end $$;
revoke execute on function public.stripe_mark_paid(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.stripe_mark_paid(uuid, text, text, text) to service_role;

-- Stripe webhook (service role): a later month of a subscription was charged.
-- Creates the portal invoice for that month (consecutive number, §14) and books it paid.
create function public.stripe_record_cycle(
  p_subscription text, p_stripe_invoice text, p_payment_intent text, p_period_start date, p_period_end date
) returns text language plpgsql security definer set search_path = '' as $$
declare
  first public.invoices%rowtype;
  existing text;
  nr text;
  id uuid;
  m integer := extract(month from p_period_start)::integer;
  de text[] := array['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  en text[] := array['January','February','March','April','May','June','July','August','September','October','November','December'];
  ind text[] := array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  base text;
begin
  select number into existing from public.invoices where stripe_invoice_id = p_stripe_invoice;
  if existing is not null then return existing; end if;
  select * into first from public.invoices where stripe_subscription_id = p_subscription order by issued_on limit 1;
  if not found then raise exception 'unknown subscription' using errcode = 'P0002'; end if;
  base := split_part(first.description ->> 'de', ' · ', 1);
  nr := public.next_doc_number('R');
  insert into public.invoices (number, org_id, kind, item_id, description, net_cents, status, allow_stripe, allow_bank,
                               issued_on, service_from, service_to, due_on, stripe_subscription_id, stripe_invoice_id, stripe_payment_intent_id)
  values (nr, first.org_id, 'subscription', null,
          jsonb_build_object('de', base || ' · ' || de[m], 'en', base || ' · ' || en[m], 'id', base || ' · ' || ind[m]),
          first.net_cents, 'open', true, false, current_date, p_period_start, p_period_end, current_date,
          p_subscription, p_stripe_invoice, p_payment_intent)
  returning invoices.id into id;
  perform private.book_paid(id, 'stripe', null);
  return nr;
end $$;
revoke execute on function public.stripe_record_cycle(text, text, text, date, date) from public, anon, authenticated;
grant execute on function public.stripe_record_cycle(text, text, text, date, date) to service_role;

-- Team: "ALS BEZAHLT ✓" after the transfer arrived (Finanzen and owner).
create function public.confirm_transfer(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_staff_role('finanzen') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.invoices where id = p_invoice and allow_bank and status in ('announced', 'open', 'overdue')) then
    raise exception 'invoice cannot be confirmed' using errcode = '22023';
  end if;
  perform private.book_paid(p_invoice, 'bank', auth.uid());
end $$;
revoke execute on function public.confirm_transfer(uuid) from public, anon;
grant execute on function public.confirm_transfer(uuid) to authenticated;
