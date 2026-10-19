-- RIDEFF Portal · schema and row-level security
-- Roles come only from this database: org_members.role for clients, staff.role for the team.
-- Staff rights require a TOTP-verified session (JWT claim aal = aal2).

create extension if not exists pgcrypto with schema extensions;

-- ── types ─────────────────────────────────────────────────────────────
create type public.locale as enum ('de', 'en', 'id');
create type public.org_status as enum ('lead', 'client');
create type public.member_role as enum ('inhaber', 'mitarbeiter');
create type public.staff_role as enum ('owner', 'support', 'finanzen', 'builder');
create type public.item_kind as enum ('approval', 'test_run', 'question', 'invoice', 'update');
create type public.item_status as enum ('open', 'approved', 'changes_requested');
create type public.offer_status as enum ('draft', 'sent', 'accepted', 'withdrawn');
create type public.invoice_kind as enum ('once', 'subscription');
create type public.invoice_status as enum ('open', 'announced', 'paid', 'overdue');
create type public.payment_method as enum ('stripe', 'bank');
create type public.lead_stage as enum ('intro_call', 'analysis_done', 'offer_sent', 'accepted');
create type public.activity_tag as enum (
  'build', 'wunsch', 'zahlung', 'datei', 'freigabe', 'ticket', 'update',
  'analyse', 'vertrag', 'rechnung', 'anfrage', 'start', 'testlauf'
);
create type public.notification_kind as enum (
  'approval_new', 'chat_reply', 'invoice_new', 'invoice_due',
  'test_run_invite', 'test_run_reminder', 'phase_change', 'weekly_summary'
);
create type public.template_kind as enum ('angebot', 'freigabe', 'erinnerung', 'start');

-- Text written by the team and shown to clients: {"de": "...", "en"?: "...", "id"?: "..."}.
-- German is required; the app falls back to it.
create domain public.l10n as jsonb
  check (jsonb_typeof(value) = 'object' and value ? 'de' and jsonb_typeof(value -> 'de') = 'string');

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── people ────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  locale public.locale not null default 'de',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'de')::public.locale
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null,
  totp_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── clients ───────────────────────────────────────────────────────────
create table public.packages (
  key text primary key,
  name text not null,
  monthly_net_cents integer not null check (monthly_net_cents > 0),
  setup_from_cents integer not null check (setup_from_cents > 0),
  sort smallint not null default 0
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  status public.org_status not null default 'lead',
  package text references public.packages (key),
  city text,
  since date,
  live_since date,
  contact_name text,
  contact_email text,
  next_step public.l10n,
  needs_action boolean not null default false,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members (user_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  phase smallint not null default 1 check (phase between 1 and 5),
  progress_pct smallint not null default 0 check (progress_pct between 0 and 100),
  go_live date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_org_idx on public.projects (org_id);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  starts_at timestamptz not null,
  title public.l10n not null,
  join_url text,
  created_at timestamptz not null default now()
);
create index meetings_project_idx on public.meetings (project_id, starts_at);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title public.l10n not null,
  kind public.item_kind not null,
  status public.item_status not null default 'open',
  deadline date,
  draft_no smallint,
  question public.l10n,
  whats_new jsonb not null default '[]'::jsonb check (jsonb_typeof(whats_new) = 'array'),
  preview_desktop_path text,
  preview_mobile_path text,
  revision_due date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);
create index items_project_idx on public.items (project_id, status);

create table public.item_decisions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  decision public.item_status not null check (decision <> 'open'),
  comment text check (comment is null or length(comment) <= 5000),
  created_at timestamptz not null default now()
);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  item_id uuid unique references public.items (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- one general thread per project (the chat without an item)
create unique index threads_general_idx on public.threads (project_id) where item_id is null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_thread_idx on public.messages (thread_id, created_at);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null unique,
  name text not null,
  ext text not null default '',
  size_bytes bigint not null check (size_bytes >= 0),
  mime text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index files_project_idx on public.files (project_id, created_at desc);

-- ── offers & invoices ─────────────────────────────────────────────────
create table public.agb_versions (
  version text primary key,
  url text not null,
  valid_from date not null
);

create table public.doc_counters (
  prefix text not null,
  year integer not null,
  last integer not null default 0,
  primary key (prefix, year)
);

-- Consecutive numbers, e.g. R-2026-051 (§14 UStG needs a unique, consecutive invoice number).
create function public.next_doc_number(p_prefix text, p_on date default current_date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  y integer := extract(year from p_on)::integer;
  n integer;
begin
  insert into public.doc_counters as c (prefix, year, last) values (p_prefix, y, 1)
  on conflict (prefix, year) do update set last = c.last + 1
  returning last into n;
  return p_prefix || '-' || y || '-' || lpad(n::text, 3, '0');
end $$;
revoke execute on function public.next_doc_number(text, date) from public, anon, authenticated;

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  number text not null unique,
  package text not null references public.packages (key),
  setup_net_cents integer not null check (setup_net_cents >= 0),
  monthly_net_cents integer not null check (monthly_net_cents >= 0),
  term_months smallint not null default 12 check (term_months > 0),
  included_groups text[] not null default '{internal,teamApp,web,ops}',
  status public.offer_status not null default 'draft',
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_ip inet,
  accepted_by uuid references auth.users (id),
  accepted_user_agent text,
  agb_version text references public.agb_versions (version),
  snapshot_pdf_path text,
  snapshot_pdf_hash text,
  created_at timestamptz not null default now(),
  constraint offers_accept_audit check (
    status <> 'accepted' or (
      accepted_at is not null and accepted_ip is not null and accepted_by is not null
      and agb_version is not null and snapshot_pdf_path is not null and snapshot_pdf_hash is not null
    )
  )
);
create index offers_org_idx on public.offers (org_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^R-[0-9]{4}-[0-9]{3,}$'),
  org_id uuid not null references public.organizations (id) on delete restrict,
  kind public.invoice_kind not null,
  item_id uuid references public.items (id) on delete set null,
  offer_id uuid references public.offers (id) on delete set null,
  description public.l10n not null,
  net_cents integer not null check (net_cents > 0),
  vat_rate numeric(4, 2) not null default 19,
  vat_cents integer generated always as ((round(net_cents * vat_rate / 100))::integer) stored,
  gross_cents integer generated always as (net_cents + (round(net_cents * vat_rate / 100))::integer) stored,
  status public.invoice_status not null default 'open',
  allow_stripe boolean not null default true,
  allow_bank boolean not null default true,
  issued_on date not null default current_date,
  service_from date,
  service_to date,
  due_on date,
  announced_at timestamptz,
  reminded_at timestamptz,
  paid_at timestamptz,
  paid_via public.payment_method,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_subscription_id text,
  stripe_invoice_id text unique,
  pdf_path text,
  created_at timestamptz not null default now(),
  constraint invoices_has_method check (allow_stripe or allow_bank),
  -- a subscription is always paid through Stripe, never by transfer
  constraint invoices_subscription_stripe check (kind = 'once' or (allow_stripe and not allow_bank)),
  constraint invoices_paid check (status <> 'paid' or (paid_at is not null and paid_via is not null))
);
create index invoices_org_idx on public.invoices (org_id, issued_on desc);
create index invoices_status_idx on public.invoices (status);

-- ── sales & team ──────────────────────────────────────────────────────
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  stage public.lead_stage not null default 'intro_call',
  next_step public.l10n,
  next_at timestamptz,
  potential_monthly_cents integer check (potential_monthly_cents >= 0),
  notes text,
  org_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  tag public.activity_tag not null,
  event text,            -- message key under "log.*", rendered with params
  params jsonb not null default '{}'::jsonb,
  text public.l10n,      -- free text written by the team
  client_visible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint activity_has_text check (event is not null or text is not null)
);
create index activity_org_idx on public.activity_log (org_id, created_at desc);

create table public.access_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users (id),
  org_id uuid not null references public.organizations (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  params jsonb not null default '{}'::jsonb,
  link text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  kind public.template_kind not null,
  locale public.locale not null,
  name text not null,
  subject text not null,
  body text not null,
  sort smallint not null default 0,
  updated_at timestamptz not null default now(),
  unique (key, locale)
);
create trigger templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();

-- ── role helpers (security definer, so policies don't recurse) ────────
create function public.is_aal2() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- Any staff role, with a TOTP-verified session.
create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_aal2() and exists (select 1 from public.staff s where s.user_id = auth.uid())
$$;

-- Owner always passes; otherwise the role must be listed.
create function public.has_staff_role(variadic roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_aal2() and exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and (s.role = 'owner' or s.role = any (roles))
  )
$$;

create function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid())
$$;

create function public.is_inhaber(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'inhaber'
  )
$$;

create function public.project_org(p_project uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.org_id from public.projects p where p.id = p_project
$$;

create function public.thread_org(p_thread uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.org_id from public.threads t join public.projects p on p.id = t.project_id where t.id = p_thread
$$;

create function public.item_org(p_item uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.org_id from public.items i join public.projects p on p.id = i.project_id where i.id = p_item
$$;

create function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

create function public.is_staff_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = p_user)
$$;

-- ── grants ────────────────────────────────────────────────────────────
-- Nothing is readable without a session. Mutations that need extra checks
-- (approve, pay, accept the offer) go through server actions and security-definer functions.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

revoke update on public.profiles from authenticated;
grant update (full_name, locale) on public.profiles to authenticated;

-- ── row-level security ────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.staff enable row level security;
alter table public.packages enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.projects enable row level security;
alter table public.meetings enable row level security;
alter table public.items enable row level security;
alter table public.item_decisions enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;
alter table public.agb_versions enable row level security;
alter table public.doc_counters enable row level security;
alter table public.offers enable row level security;
alter table public.invoices enable row level security;
alter table public.leads enable row level security;
alter table public.activity_log enable row level security;
alter table public.access_log enable row level security;
alter table public.notifications enable row level security;
alter table public.templates enable row level security;

-- profiles: yourself, people in your org, the team (clients see who wrote to them)
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_staff() or public.shares_org_with(id) or public.is_staff_user(id)
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- staff: your own row is readable before 2FA, so the app knows to ask for it
create policy staff_select on public.staff for select to authenticated using (
  user_id = auth.uid() or public.has_staff_role('owner')
);
create policy staff_owner_write on public.staff for all to authenticated
  using (public.has_staff_role('owner')) with check (public.has_staff_role('owner'));

create policy packages_select on public.packages for select to authenticated using (true);
create policy packages_owner_write on public.packages for all to authenticated
  using (public.has_staff_role('owner')) with check (public.has_staff_role('owner'));

create policy agb_select on public.agb_versions for select to authenticated using (true);
create policy agb_owner_write on public.agb_versions for all to authenticated
  using (public.has_staff_role('owner')) with check (public.has_staff_role('owner'));

-- organizations: members see their own; every staff role needs the client names
create policy orgs_select on public.organizations for select to authenticated using (
  public.is_member(id) or public.is_staff()
);
create policy orgs_staff_insert on public.organizations for insert to authenticated
  with check (public.has_staff_role('support'));
create policy orgs_staff_update on public.organizations for update to authenticated
  using (public.has_staff_role('support', 'builder')) with check (public.has_staff_role('support', 'builder'));
create policy orgs_owner_delete on public.organizations for delete to authenticated
  using (public.has_staff_role('owner'));

create policy members_select on public.org_members for select to authenticated using (
  user_id = auth.uid() or public.is_member(org_id) or public.is_staff()
);
create policy members_staff_write on public.org_members for all to authenticated
  using (public.has_staff_role('support')) with check (public.has_staff_role('support'));

-- project content: members, plus support and builder
create policy projects_select on public.projects for select to authenticated using (
  public.is_member(org_id) or public.has_staff_role('support', 'builder')
);
create policy projects_staff_insert on public.projects for insert to authenticated
  with check (public.has_staff_role('support', 'builder'));
create policy projects_staff_update on public.projects for update to authenticated
  using (public.has_staff_role('builder', 'support')) with check (public.has_staff_role('builder', 'support'));

create policy meetings_select on public.meetings for select to authenticated using (
  public.is_member(public.project_org(project_id)) or public.has_staff_role('support', 'builder')
);
create policy meetings_staff_write on public.meetings for all to authenticated
  using (public.has_staff_role('support', 'builder')) with check (public.has_staff_role('support', 'builder'));

create policy items_select on public.items for select to authenticated using (
  public.is_member(public.project_org(project_id)) or public.has_staff_role('support', 'builder')
);
create policy items_staff_write on public.items for all to authenticated
  using (public.has_staff_role('builder')) with check (public.has_staff_role('builder'));

create policy decisions_select on public.item_decisions for select to authenticated using (
  public.is_member(public.item_org(item_id)) or public.has_staff_role('support', 'builder')
);

create policy threads_select on public.threads for select to authenticated using (
  public.is_member(public.project_org(project_id)) or public.has_staff_role('support', 'builder')
);
create policy threads_staff_write on public.threads for insert to authenticated
  with check (public.has_staff_role('support', 'builder'));

-- chat: both client roles may write; you can only post as yourself
create policy messages_select on public.messages for select to authenticated using (
  public.is_member(public.thread_org(thread_id)) or public.has_staff_role('support', 'builder')
);
create policy messages_insert on public.messages for insert to authenticated with check (
  author_id = auth.uid() and read_at is null and (
    public.is_member(public.thread_org(thread_id)) or public.has_staff_role('support', 'builder')
  )
);

-- files: Mitarbeiter only view (see open question), the Inhaber and the team upload
create policy files_select on public.files for select to authenticated using (
  public.is_member(public.project_org(project_id)) or public.has_staff_role('support', 'builder')
);
create policy files_insert on public.files for insert to authenticated with check (
  uploaded_by = auth.uid() and (
    public.is_inhaber(public.project_org(project_id)) or public.has_staff_role('support', 'builder')
  )
);
create policy files_staff_delete on public.files for delete to authenticated
  using (public.has_staff_role('support', 'builder'));

-- offers: a lead sees a quote once it is sent; acceptance runs through a server action
create policy offers_select on public.offers for select to authenticated using (
  (public.is_member(org_id) and status <> 'draft') or public.has_staff_role('support', 'finanzen')
);
create policy offers_staff_write on public.offers for all to authenticated
  using (public.has_staff_role('support')) with check (public.has_staff_role('support'));

-- invoices: no support or builder access ("no invoices")
create policy invoices_select on public.invoices for select to authenticated using (
  public.is_member(org_id) or public.has_staff_role('finanzen')
);
create policy invoices_finance_write on public.invoices for all to authenticated
  using (public.has_staff_role('finanzen')) with check (public.has_staff_role('finanzen'));

create policy leads_staff on public.leads for all to authenticated
  using (public.has_staff_role('support')) with check (public.has_staff_role('support'));

create policy activity_select on public.activity_log for select to authenticated using (
  (public.is_member(org_id) and client_visible) or public.is_staff()
);
create policy activity_staff_insert on public.activity_log for insert to authenticated
  with check (public.is_staff());

create policy access_select on public.access_log for select to authenticated using (
  public.has_staff_role('owner') or (staff_id = auth.uid() and public.is_staff())
);
create policy access_insert on public.access_log for insert to authenticated
  with check (staff_id = auth.uid() and public.is_staff());
create policy access_update_own on public.access_log for update to authenticated
  using (staff_id = auth.uid() and public.is_staff()) with check (staff_id = auth.uid());

create policy notifications_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy templates_select on public.templates for select to authenticated using (public.is_staff());
create policy templates_write on public.templates for all to authenticated
  using (public.has_staff_role('support')) with check (public.has_staff_role('support'));

-- doc_counters: no policies; only next_doc_number() touches it.

-- After a verified TOTP enrolment the server marks the factor on the staff row.
create function public.mark_totp_enabled() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_aal2() then
    raise exception 'aal2 required' using errcode = '42501';
  end if;
  update public.staff set totp_enabled = true where user_id = auth.uid();
end $$;
revoke execute on function public.mark_totp_enabled() from public, anon;
grant execute on function public.mark_totp_enabled() to authenticated;
