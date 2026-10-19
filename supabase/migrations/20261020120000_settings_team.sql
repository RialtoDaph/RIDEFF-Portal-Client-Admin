-- Step 8 · notifications UI, settings and client team, team screen, recovery codes, weekly summary.

-- 3 · the bell refreshes when a row arrives
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- 4 · client team: the Inhaber adds members and changes or removes others (never themselves,
-- so an organisation always keeps at least one Inhaber). The auth user is created by the server.
create policy members_inhaber_insert on public.org_members for insert to authenticated
  with check (private.is_inhaber(org_id) and user_id <> auth.uid());
create policy members_inhaber_update on public.org_members for update to authenticated
  using (private.is_inhaber(org_id) and user_id <> auth.uid())
  with check (private.is_inhaber(org_id) and user_id <> auth.uid());
create policy members_inhaber_remove on public.org_members for delete to authenticated
  using (private.is_inhaber(org_id) and user_id <> auth.uid());

-- 1 · recovery codes for staff 2FA (SHA-256 of the code; the codes themselves are shown once)
create table public.staff_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index staff_recovery_codes_user_idx on public.staff_recovery_codes (user_id) where used_at is null;
alter table public.staff_recovery_codes enable row level security;
-- no policies: only the functions below touch it

-- New set after enrolment (aal2): earlier unused codes stop working.
create function public.set_recovery_codes(p_hashes text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_aal2() and exists (select 1 from public.staff where user_id = auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(array_length(p_hashes, 1), 0) <> 10 then raise exception 'ten codes expected' using errcode = '22023'; end if;
  update public.staff_recovery_codes set used_at = now() where user_id = auth.uid() and used_at is null;
  insert into public.staff_recovery_codes (user_id, code_hash) select auth.uid(), h from unnest(p_hashes) h;
end $$;
revoke execute on function public.set_recovery_codes(text[]) from public, anon;
grant execute on function public.set_recovery_codes(text[]) to authenticated;

-- Signing in with a code (aal1): marks it used. The server then removes the TOTP factor.
create function public.consume_recovery_code(p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  hit uuid;
begin
  if not exists (select 1 from public.staff where user_id = auth.uid()) then return false; end if;
  update public.staff_recovery_codes set used_at = now()
   where id = (select id from public.staff_recovery_codes where user_id = auth.uid() and code_hash = p_hash and used_at is null limit 1)
  returning id into hit;
  if hit is null then return false; end if;
  update public.staff set totp_enabled = false where user_id = auth.uid();
  return true;
end $$;
revoke execute on function public.consume_recovery_code(text) from public, anon;
grant execute on function public.consume_recovery_code(text) to authenticated;

create function public.recovery_codes_left() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.staff_recovery_codes where user_id = auth.uid() and used_at is null
$$;
revoke execute on function public.recovery_codes_left() from public, anon;
grant execute on function public.recovery_codes_left() to authenticated;

-- 2 · view as client: the pages a staff member opened while viewing
alter table public.access_log add column pages text[] not null default '{}';
create index access_log_started_idx on public.access_log (started_at desc);

-- 5 · weekly summary: every project of the client in one mail
create or replace function public.run_weekly_summary() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.notifications (user_id, kind, params, link)
  select m.user_id, 'weekly_summary',
         jsonb_build_object(
           'project', ps.projects -> 0 ->> 'project', 'phase', (ps.projects -> 0 ->> 'phase')::int, 'pct', (ps.projects -> 0 ->> 'pct')::int,
           'approvals', (ps.projects -> 0 ->> 'approvals')::int, 'files', (ps.projects -> 0 ->> 'files')::int,
           'invoices', (select count(*) from public.invoices iv where iv.org_id = o.id and iv.status in ('open', 'overdue')),
           'projects', ps.projects),
         '/'
    from public.organizations o
    join lateral (
      select jsonb_agg(jsonb_build_object(
               'project', pr.name, 'phase', pr.phase, 'pct', pr.progress_pct,
               'approvals', (select count(*) from public.items i where i.project_id = pr.id and i.kind = 'approval' and i.status = 'open'),
               'files', (select count(*) from public.files f where f.project_id = pr.id and f.created_at > now() - interval '7 days'))
             order by pr.created_at) as projects
        from public.projects pr where pr.org_id = o.id
    ) ps on ps.projects is not null
    join public.org_members m on m.org_id = o.id
   where o.status = 'client'
     and not exists (select 1 from public.notifications x where x.user_id = m.user_id and x.kind = 'weekly_summary' and x.created_at > now() - interval '6 days');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.run_weekly_summary() from public, anon, authenticated;
grant execute on function public.run_weekly_summary() to service_role;
