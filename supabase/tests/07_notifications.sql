-- Step 7: notification triggers and the daily/weekly jobs.
begin;
create function pg_temp.eq(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;

select pg_temp.eq('seed created no notifications', (select count(*) from public.notifications), 0);

-- 1 · new approval → both Café Linde members
insert into public.items (project_id, title, kind, deadline) values ('00000000-0000-4000-c000-000000000001', '{"de":"Speisekarte"}', 'approval', current_date + 5);
select pg_temp.eq('approval notifies Lena and Mia', (select count(*) from public.notifications where kind = 'approval_new'), 2);

-- 2 · team message → client members; client message → team; throttled per hour
insert into public.messages (thread_id, author_id, body) values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001', 'Neue Version ist online.');
select pg_temp.eq('team reply notifies the client members', (select count(*) from public.notifications where kind = 'chat_reply' and params ->> 'to' = 'client'), 2);
insert into public.messages (thread_id, author_id, body) values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001', 'Und noch eine Kleinigkeit.');
select pg_temp.eq('second reply within the hour is throttled', (select count(*) from public.notifications where kind = 'chat_reply' and params ->> 'to' = 'client'), 2);
insert into public.messages (thread_id, author_id, body) values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000101', 'Danke!');
select pg_temp.eq('client message notifies the team, not the author', (select count(*) from public.notifications where kind = 'chat_reply' and params ->> 'to' = 'team'), 1);
select pg_temp.eq('excerpt is stored', (select count(*) from public.notifications where kind = 'chat_reply' and params ->> 'excerpt' = 'Danke!'), 1);

-- 3 · new open invoice → Inhaber only; paid ones stay quiet
insert into public.invoices (number, org_id, kind, description, net_cents, due_on) values ('R-2026-901', '00000000-0000-4000-b000-000000000001', 'once', '{"de":"Extra"}', 10000, current_date + 3);
select pg_temp.eq('invoice notifies the Inhaber only', (select count(*) from public.notifications where kind = 'invoice_new'), 1);
insert into public.invoices (number, org_id, kind, description, net_cents, status, paid_at, paid_via) values ('R-2026-902', '00000000-0000-4000-b000-000000000001', 'once', '{"de":"Extra"}', 10000, 'paid', now(), 'stripe');
select pg_temp.eq('paid invoice is not announced', (select count(*) from public.notifications where kind = 'invoice_new'), 1);

-- 4 · test run invite
insert into public.meetings (project_id, starts_at, kind, title) values ('00000000-0000-4000-c000-000000000005', now() + interval '1 day', 'test_run', '{"de":"Aufmaß-App"}');
select pg_temp.eq('test run invites Martin', (select count(*) from public.notifications where kind = 'test_run_invite'), 1);

-- 5 · phase change
update public.projects set phase = 4 where id = '00000000-0000-4000-c000-000000000006';
select pg_temp.eq('phase change notifies Ida', (select count(*) from public.notifications where kind = 'phase_change'), 1);
update public.projects set progress_pct = 45 where id = '00000000-0000-4000-c000-000000000006';
select pg_temp.eq('progress alone does not notify', (select count(*) from public.notifications where kind = 'phase_change'), 1);

-- daily job
select pg_temp.eq('daily: due notice and reminder created', (select ((r ->> 'due')::int + (r ->> 'reminders')::int) from (select public.run_daily_notifications() r) x), 2);
select pg_temp.eq('daily is idempotent', (select ((r ->> 'due')::int + (r ->> 'reminders')::int) from (select public.run_daily_notifications() r) x), 0);
update public.invoices set due_on = current_date - 1 where number = 'R-2026-901';
select public.run_daily_notifications();
select pg_temp.eq('past due becomes overdue', (select count(*) from public.invoices where number = 'R-2026-901' and status = 'overdue'), 1);

-- weekly
select pg_temp.eq('weekly summary for every client member', (select public.run_weekly_summary()), 7);
select pg_temp.eq('weekly runs once per week', (select public.run_weekly_summary()), 0);

-- a client cannot run the jobs
set local role authenticated;
do $$ begin
  perform public.run_weekly_summary();
  raise exception 'FAIL: client ran the weekly job';
exception when insufficient_privilege then raise notice 'ok  client cannot run the jobs';
end $$;
reset role;
rollback;
