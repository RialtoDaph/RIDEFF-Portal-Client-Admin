-- Step 8.6 · admin project editing: phase and progress, new projects, test runs with a subject.

-- What a test run tests ("Team-App"), used in the invite and reminder emails ({System}).
-- The title stays what the portal shows ("Testlauf Team-App mit Can und Mia · Video").
alter table public.meetings add column subject public.l10n;

create or replace function private.on_meeting_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'test_run' and new.starts_at > now() then
    perform private.notify_members(private.project_org(new.project_id), 'test_run_invite',
      jsonb_build_object('meeting_id', new.id, 'title', coalesce(new.subject, new.title), 'starts_at', new.starts_at), '/');
  end if;
  return new;
end $$;

create or replace function public.run_daily_notifications() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  overdue integer;
  due integer;
  reminders integer;
begin
  update public.invoices set status = 'overdue' where status = 'open' and due_on < today;
  get diagnostics overdue = row_count;

  insert into public.notifications (user_id, kind, params, link)
  select m.user_id, 'invoice_due',
         jsonb_build_object('invoice_id', i.id, 'nr', i.number, 'amount_cents', i.gross_cents, 'due', i.due_on, 'item', i.description),
         '/rechnungen'
    from public.invoices i join public.org_members m on m.org_id = i.org_id and m.role = 'inhaber'
   where i.status = 'open' and i.due_on = today + 3
     and not exists (select 1 from public.notifications n where n.user_id = m.user_id and n.kind = 'invoice_due' and n.params ->> 'invoice_id' = i.id::text);
  get diagnostics due = row_count;

  insert into public.notifications (user_id, kind, params, link)
  select m.user_id, 'test_run_reminder', jsonb_build_object('meeting_id', mt.id, 'title', coalesce(mt.subject, mt.title), 'starts_at', mt.starts_at), '/'
    from public.meetings mt join public.projects p on p.id = mt.project_id join public.org_members m on m.org_id = p.org_id
   where mt.kind = 'test_run' and (mt.starts_at at time zone 'Europe/Berlin')::date = today + 1
     and not exists (select 1 from public.notifications n where n.user_id = m.user_id and n.kind = 'test_run_reminder' and n.params ->> 'meeting_id' = mt.id::text);
  get diagnostics reminders = row_count;

  return jsonb_build_object('overdue', overdue, 'due', due, 'reminders', reminders);
end $$;
revoke execute on function public.run_daily_notifications() from public, anon, authenticated;
grant execute on function public.run_daily_notifications() to service_role;

-- Phase, % and go-live. Phase 05 marks the client live (once).
create function public.set_project_progress(p_project uuid, p_phase smallint, p_pct smallint, p_go_live date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  if not private.has_staff_role('support', 'builder') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_phase not between 1 and 5 or p_pct not between 0 and 100 then raise exception 'out of range' using errcode = '22023'; end if;
  update public.projects set phase = p_phase, progress_pct = p_pct, go_live = p_go_live where id = p_project returning org_id into org;
  if org is null then raise exception 'project not found' using errcode = 'P0002'; end if;
  if p_phase = 5 then
    update public.organizations set live_since = coalesce(live_since, current_date) where id = org;
  end if;
end $$;
revoke execute on function public.set_project_progress(uuid, smallint, smallint, date) from public, anon;
grant execute on function public.set_project_progress(uuid, smallint, smallint, date) to authenticated;

-- A further project for a client, with its general chat thread.
create function public.create_project(p_org uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  proj uuid;
begin
  if not private.has_staff_role('support', 'builder') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'name required' using errcode = '22023'; end if;
  if not exists (select 1 from public.organizations where id = p_org) then raise exception 'organisation not found' using errcode = 'P0002'; end if;
  insert into public.projects (org_id, name, phase, progress_pct) values (p_org, trim(p_name), 2, 0) returning id into proj;
  insert into public.threads (project_id) values (proj);
  return proj;
end $$;
revoke execute on function public.create_project(uuid, text) from public, anon;
grant execute on function public.create_project(uuid, text) to authenticated;
