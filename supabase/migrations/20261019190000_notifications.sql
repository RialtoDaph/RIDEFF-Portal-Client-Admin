-- Step 7 · notifications. Triggers write the in-app rows, so every path (actions, webhooks, admin)
-- notifies the same way. The server sends the emails for rows with emailed_at = null (cron).

-- Email preferences, e.g. {"weekly_summary": false}. A missing key means "on". The UI comes in step 8.
alter table public.profiles add column email_prefs jsonb not null default '{}'::jsonb;
grant update (email_prefs) on public.profiles to authenticated;

-- Meetings can be test runs (invite + reminder the day before).
alter table public.meetings add column kind text not null default 'meeting' check (kind in ('meeting', 'test_run'));
update public.meetings set kind = 'test_run' where title ->> 'de' like 'Testlauf%';

create index notifications_unsent_idx on public.notifications (created_at) where emailed_at is null;

-- recipients ───────────────────────────────────────────────────────────
create function private.notify_members(p_org uuid, p_kind public.notification_kind, p_params jsonb, p_link text,
                                        p_only_inhaber boolean default false, p_except uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, params, link)
  select m.user_id, p_kind, p_params, p_link from public.org_members m
   where m.org_id = p_org and (not p_only_inhaber or m.role = 'inhaber') and m.user_id is distinct from p_except;
$$;

-- 1 · a new approval ──────────────────────────────────────────────────
create function private.on_item_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'approval' and new.status = 'open' then
    perform private.notify_members(private.project_org(new.project_id), 'approval_new',
      jsonb_build_object('item_id', new.id, 'title', new.title, 'deadline', new.deadline), '/');
  end if;
  return new;
end $$;
create trigger items_notify after insert on public.items for each row execute function private.on_item_insert();

-- 2 · a chat reply (at most one per thread, recipient and hour) ───────────
create function private.on_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  org uuid := private.thread_org(new.thread_id);
  title jsonb;
  author text;
  params jsonb;
  from_team boolean := private.is_staff_user(new.author_id);
begin
  select coalesce(i.title, jsonb_build_object('de', p.name)) into title
    from public.threads t join public.projects p on p.id = t.project_id left join public.items i on i.id = t.item_id
   where t.id = new.thread_id;
  select full_name into author from public.profiles where id = new.author_id;
  params := jsonb_build_object('thread_id', new.thread_id, 'title', title, 'author', author,
                               'excerpt', left(new.body, 280), 'org', (select name from public.organizations where id = org),
                               'to', case when from_team then 'client' else 'team' end);
  insert into public.notifications (user_id, kind, params, link)
  select r.user_id, 'chat_reply', params, case when from_team then '/' else '/admin/inbox?t=' || new.thread_id end
    from (
      select m.user_id from public.org_members m where from_team and m.org_id = org
      union
      select s.user_id from public.staff s where not from_team and s.role in ('owner', 'support', 'builder')
    ) r
   where r.user_id <> new.author_id
     and not exists (
       select 1 from public.notifications n
        where n.user_id = r.user_id and n.kind = 'chat_reply' and n.read_at is null
          and n.params ->> 'thread_id' = new.thread_id::text and n.created_at > now() - interval '1 hour');
  return new;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function private.on_message_insert();

-- 3 · a new invoice (to the Inhaber; monthly Stripe charges arrive already paid and stay quiet) ─
create function private.on_invoice_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('open', 'overdue') then
    perform private.notify_members(new.org_id, 'invoice_new',
      jsonb_build_object('invoice_id', new.id, 'nr', new.number, 'amount_cents', new.gross_cents, 'due', new.due_on, 'item', new.description),
      '/rechnungen', true);
  end if;
  return new;
end $$;
create trigger invoices_notify after insert on public.invoices for each row execute function private.on_invoice_insert();

-- 4 · a test-run invite ───────────────────────────────────────────────
create function private.on_meeting_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'test_run' and new.starts_at > now() then
    perform private.notify_members(private.project_org(new.project_id), 'test_run_invite',
      jsonb_build_object('meeting_id', new.id, 'title', new.title, 'starts_at', new.starts_at), '/');
  end if;
  return new;
end $$;
create trigger meetings_notify after insert on public.meetings for each row execute function private.on_meeting_insert();

-- 5 · a phase change ──────────────────────────────────────────────────
create function private.on_project_phase() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phase is distinct from old.phase then
    perform private.notify_members(new.org_id, 'phase_change',
      jsonb_build_object('project_id', new.id, 'project', new.name, 'phase', new.phase), '/');
  end if;
  return new;
end $$;
create trigger projects_notify after update of phase on public.projects for each row execute function private.on_project_phase();

-- daily (server cron): overdue status, due-date notice 3 days ahead, test-run reminder the day before ─
create function public.run_daily_notifications() returns jsonb
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
  select m.user_id, 'test_run_reminder', jsonb_build_object('meeting_id', mt.id, 'title', mt.title, 'starts_at', mt.starts_at), '/'
    from public.meetings mt join public.projects p on p.id = mt.project_id join public.org_members m on m.org_id = p.org_id
   where mt.kind = 'test_run' and (mt.starts_at at time zone 'Europe/Berlin')::date = today + 1
     and not exists (select 1 from public.notifications n where n.user_id = m.user_id and n.kind = 'test_run_reminder' and n.params ->> 'meeting_id' = mt.id::text);
  get diagnostics reminders = row_count;

  return jsonb_build_object('overdue', overdue, 'due', due, 'reminders', reminders);
end $$;

-- weekly (server cron, Monday): one summary per client member ──────────
create function public.run_weekly_summary() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.notifications (user_id, kind, params, link)
  select m.user_id, 'weekly_summary',
         jsonb_build_object(
           'project', p.name, 'phase', p.phase, 'pct', p.progress_pct,
           'approvals', (select count(*) from public.items i where i.project_id = p.id and i.kind = 'approval' and i.status = 'open'),
           'invoices', (select count(*) from public.invoices iv where iv.org_id = o.id and iv.status in ('open', 'overdue')),
           'files', (select count(*) from public.files f where f.project_id = p.id and f.created_at > now() - interval '7 days')),
         '/'
    from public.organizations o
    join lateral (select * from public.projects pr where pr.org_id = o.id order by pr.created_at limit 1) p on true
    join public.org_members m on m.org_id = o.id
   where o.status = 'client'
     and not exists (select 1 from public.notifications x where x.user_id = m.user_id and x.kind = 'weekly_summary' and x.created_at > now() - interval '6 days');
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function private.notify_members(uuid, public.notification_kind, jsonb, text, boolean, uuid) from public, anon, authenticated;
revoke all on function private.on_item_insert() from public, anon, authenticated;
revoke all on function private.on_message_insert() from public, anon, authenticated;
revoke all on function private.on_invoice_insert() from public, anon, authenticated;
revoke all on function private.on_meeting_insert() from public, anon, authenticated;
revoke all on function private.on_project_phase() from public, anon, authenticated;
revoke execute on function public.run_daily_notifications() from public, anon, authenticated;
revoke execute on function public.run_weekly_summary() from public, anon, authenticated;
grant execute on function public.run_daily_notifications() to service_role;
grant execute on function public.run_weekly_summary() to service_role;
