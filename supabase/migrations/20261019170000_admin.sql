-- Step 5 · admin: create clients, send quotes, reminders, the decision queue.

alter type public.activity_tag add value if not exists 'angebot';
alter type public.activity_tag add value if not exists 'erinnerung';

-- "S SPÄTER": a queue card comes back tomorrow, per staff member.
create table public.queue_snoozes (
  staff_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  until timestamptz not null,
  primary key (staff_id, key)
);
alter table public.queue_snoozes enable row level security;
create policy snoozes_own on public.queue_snoozes for all to authenticated
  using (staff_id = auth.uid() and private.is_staff()) with check (staff_id = auth.uid() and private.is_staff());

-- Neuer Kunde. The auth user is created by the server (service role) first; this function
-- creates the organisation, project, chat thread and Inhaber membership in one transaction.
-- With p_org it converts an existing lead (e.g. after the quote was approved).
create function public.create_client_org(
  p_user uuid, p_company text, p_contact text, p_email text, p_city text, p_package text, p_org uuid default null, p_invited boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  org uuid := p_org;
  proj uuid;
  pkg_name text;
  base_slug text;
  v_slug text;
  n integer := 1;
begin
  if not private.has_staff_role('support') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(trim(coalesce(p_company, ''))) = 0 or length(trim(coalesce(p_contact, ''))) = 0 then
    raise exception 'company and contact required' using errcode = '22023';
  end if;
  select name into pkg_name from public.packages where key = p_package;
  if pkg_name is null then raise exception 'unknown package' using errcode = '22023'; end if;

  if org is null then
    base_slug := trim(both '-' from regexp_replace(lower(replace(translate(trim(p_company), 'äöüÄÖÜéèáàç', 'aouaoueeaac'), 'ß', 'ss')), '[^a-z0-9]+', '-', 'g'));
    if base_slug = '' then base_slug := 'kunde'; end if;
    v_slug := base_slug;
    while exists (select 1 from public.organizations o where o.slug = v_slug) loop
      n := n + 1;
      v_slug := base_slug || '-' || n;
    end loop;
    insert into public.organizations (name, slug, status, package, city, since, contact_name, contact_email, next_step)
    values (trim(p_company), v_slug, 'client', p_package, nullif(trim(coalesce(p_city, '')), ''), current_date, trim(p_contact), lower(trim(p_email)),
            '{"de": "Analyse planen"}')
    returning id into org;
  else
    update public.organizations set
      name = trim(p_company), status = 'client', package = p_package,
      city = coalesce(nullif(trim(coalesce(p_city, '')), ''), city), since = coalesce(since, current_date),
      contact_name = trim(p_contact), contact_email = lower(trim(p_email)),
      next_step = coalesce(next_step, '{"de": "Analyse planen"}')
    where id = org;
    if not found then raise exception 'organisation not found' using errcode = 'P0002'; end if;
  end if;

  insert into public.org_members (org_id, user_id, role) values (org, p_user, 'inhaber')
  on conflict (org_id, user_id) do update set role = 'inhaber';

  if not exists (select 1 from public.projects where org_id = org) then
    insert into public.projects (org_id, name, phase, progress_pct) values (org, pkg_name, 2, 0) returning id into proj;
    insert into public.threads (project_id) values (proj);
  end if;

  update public.leads set stage = 'accepted', org_id = org where org_id = org or lower(email) = lower(trim(p_email));

  insert into public.activity_log (org_id, actor_id, tag, text, client_visible)
  values (org, auth.uid(), 'start',
          case when p_invited then '{"de": "Portal-Einladung gesendet"}'::jsonb else '{"de": "Zugang angelegt"}'::jsonb end, false);
  return org;
end $$;
revoke execute on function public.create_client_org(uuid, text, text, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.create_client_org(uuid, text, text, text, text, text, uuid, boolean) to authenticated;

-- "↵ PRÜFEN & SENDEN": the draft quote becomes visible to the lead.
create function public.send_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.offers%rowtype;
begin
  if not private.has_staff_role('support') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into o from public.offers where id = p_offer for update;
  if not found then raise exception 'offer not found' using errcode = 'P0002'; end if;
  if o.status <> 'draft' then raise exception 'offer is not a draft' using errcode = '22023'; end if;
  update public.offers set status = 'sent', sent_at = now() where id = p_offer;
  update public.leads set stage = 'offer_sent' where org_id = o.org_id and stage in ('intro_call', 'analysis_done');
  insert into public.activity_log (org_id, actor_id, tag, event, params, client_visible)
  values (o.org_id, auth.uid(), 'angebot', 'offerSent', jsonb_build_object('nr', o.number), true);
end $$;
revoke execute on function public.send_offer(uuid) from public, anon;
grant execute on function public.send_offer(uuid) to authenticated;

-- "ERINNERUNG SENDEN" (Finanzen and owner). The email itself is sent by the server.
create function public.remind_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  iv public.invoices%rowtype;
begin
  if not private.has_staff_role('finanzen') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into iv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found' using errcode = 'P0002'; end if;
  if iv.status not in ('open', 'overdue') then raise exception 'invoice is not open' using errcode = '22023'; end if;
  update public.invoices set reminded_at = now() where id = p_invoice;
  insert into public.activity_log (org_id, actor_id, tag, event, params, client_visible)
  values (iv.org_id, auth.uid(), 'erinnerung', 'reminderSent', jsonb_build_object('nr', iv.number), false);
end $$;
revoke execute on function public.remind_invoice(uuid) from public, anon;
grant execute on function public.remind_invoice(uuid) to authenticated;

-- The queue needs the age of the oldest open approval per project (staff only through RLS).
create index items_open_idx on public.items (status, created_at) where status = 'open';
