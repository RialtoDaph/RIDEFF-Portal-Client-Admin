-- Step 3 · quote approval. Approval forms the contract, so it is recorded with
-- time, IP, user, user agent, AGB version and a PDF snapshot with its SHA-256 hash.

-- Payment term for new invoices; still to be confirmed by the owner.
create table public.settings (
  key text primary key,
  value jsonb not null
);
alter table public.settings enable row level security;
create policy settings_staff_read on public.settings for select to authenticated using (private.is_staff());
create policy settings_owner_write on public.settings for all to authenticated
  using (private.has_staff_role('owner')) with check (private.has_staff_role('owner'));
insert into public.settings (key, value) values ('payment_term_days', '14');

-- Called only by the server (service role) after it has checked the session, the Inhaber role
-- and the AGB box, and has stored the PDF. A browser cannot call it, so it cannot fake IP or hash.
create function public.accept_offer(
  p_offer uuid,
  p_user uuid,
  p_ip inet,
  p_user_agent text,
  p_agb_version text,
  p_pdf_path text,
  p_pdf_hash text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  o public.offers%rowtype;
  pkg text;
  nr text;
  term integer;
begin
  select * into o from public.offers where id = p_offer for update;
  if not found then raise exception 'offer not found' using errcode = 'P0002'; end if;
  if o.status <> 'sent' then raise exception 'offer is not open' using errcode = '22023'; end if;
  if not exists (select 1 from public.org_members m where m.org_id = o.org_id and m.user_id = p_user and m.role = 'inhaber') then
    raise exception 'only the Inhaber can accept' using errcode = '42501';
  end if;
  if not exists (select 1 from public.agb_versions where version = p_agb_version) then
    raise exception 'unknown AGB version' using errcode = '22023';
  end if;
  if p_pdf_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid hash' using errcode = '22023'; end if;

  update public.offers set
    status = 'accepted', accepted_at = now(), accepted_ip = p_ip, accepted_by = p_user,
    accepted_user_agent = left(p_user_agent, 500), agb_version = p_agb_version,
    snapshot_pdf_path = p_pdf_path, snapshot_pdf_hash = p_pdf_hash
  where id = p_offer;

  -- the setup invoice, created automatically
  select name into pkg from public.packages where key = o.package;
  select coalesce((value #>> '{}')::integer, 14) into term from public.settings where key = 'payment_term_days';
  nr := public.next_doc_number('R');
  insert into public.invoices (number, org_id, kind, offer_id, description, net_cents, allow_stripe, allow_bank, issued_on, service_from, service_to, due_on)
  values (
    nr, o.org_id, 'once', o.id,
    jsonb_build_object('de', 'Setup ' || pkg, 'en', pkg || ' setup', 'id', 'Setup ' || pkg),
    o.setup_net_cents, true, true, current_date, current_date, current_date, current_date + coalesce(term, 14)
  );

  insert into public.activity_log (org_id, actor_id, tag, event, params)
  values (o.org_id, p_user, 'vertrag', 'offerAccepted', jsonb_build_object('nr', o.number, 'invoice', nr, 'package', pkg));

  update public.leads set stage = 'accepted' where org_id = o.org_id;

  -- in-app notice for the team (owner and support); email follows in step 7
  insert into public.notifications (user_id, kind, params, link)
  select s.user_id, 'approval_new', jsonb_build_object('offer', o.number, 'org_id', o.org_id, 'invoice', nr), '/admin'
    from public.staff s where s.role in ('owner', 'support');

  return nr;
end $$;
revoke execute on function public.accept_offer(uuid, uuid, inet, text, text, text, text) from public, anon, authenticated;
grant execute on function public.accept_offer(uuid, uuid, inet, text, text, text, text) to service_role;

-- PDF snapshots: written by the server only, readable by the org and the team that sees offers.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit) values ('offers', 'offers', false, 5242880)
    on conflict (id) do nothing;
    execute $p$
      create policy offers_read on storage.objects for select to authenticated using (
        bucket_id = 'offers' and (
          private.is_member(((storage.foldername(name))[1])::uuid)
          or private.has_staff_role('support', 'finanzen')
        )
      )$p$;
  end if;
end $$;
