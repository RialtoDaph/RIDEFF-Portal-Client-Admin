-- Step 2: approvals, undo, chat read state, upload log.
begin;

create function pg_temp.as_user(p_sub uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
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
grant execute on function pg_temp.as_user(uuid, text), pg_temp.eq(text, bigint, bigint), pg_temp.denied(text, text) to authenticated;

-- Mia (Mitarbeiterin) cannot decide
select pg_temp.as_user('00000000-0000-4000-a000-000000000102');
select pg_temp.denied('mitarbeiterin cannot approve', $$select public.decide_item('00000000-0000-4000-d000-000000000001', 'approved')$$);
reset role;

-- Nora (another org) cannot decide
select pg_temp.as_user('00000000-0000-4000-a000-000000000201');
select pg_temp.denied('other org cannot approve', $$select public.decide_item('00000000-0000-4000-d000-000000000001', 'approved')$$);
reset role;

-- Lena approves, then undoes
select pg_temp.as_user('00000000-0000-4000-a000-000000000101');
select pg_temp.denied('change request needs a comment', $$select public.decide_item('00000000-0000-4000-d000-000000000001', 'changes_requested', '  ')$$);
select public.decide_item('00000000-0000-4000-d000-000000000001', 'approved');
select pg_temp.eq('item is approved', (select count(*) from public.items where id = '00000000-0000-4000-d000-000000000001' and status = 'approved'), 1);
select pg_temp.eq('approval is logged', (select count(*) from public.activity_log where event = 'itemApproved'), 1);
select pg_temp.eq('decision is recorded', (select count(*) from public.item_decisions), 1);
select pg_temp.denied('cannot approve twice', $$select public.decide_item('00000000-0000-4000-d000-000000000001', 'approved')$$);
select public.undo_item_decision('00000000-0000-4000-d000-000000000001');
select pg_temp.eq('undo reopens the item', (select count(*) from public.items where id = '00000000-0000-4000-d000-000000000001' and status = 'open'), 1);
select pg_temp.eq('undo hides the log line from the client', (select count(*) from public.activity_log where event = 'itemApproved'), 0);
reset role;
select pg_temp.eq('the team still sees it as undone', (select count(*) from public.activity_log where event = 'itemApproved' and params ->> 'undone' = 'true'), 1);
select pg_temp.as_user('00000000-0000-4000-a000-000000000101');

-- change request goes into the thread
select public.decide_item('00000000-0000-4000-d000-000000000001', 'changes_requested', 'Öffnungszeiten weiter oben.');
select pg_temp.eq('change request lands in the thread', (select count(*) from public.messages where thread_id = '00000000-0000-4000-e000-000000000001' and body = 'Öffnungszeiten weiter oben.'), 1);
select pg_temp.eq('change request is logged', (select count(*) from public.activity_log where event = 'changeRequested' and params ->> 'text' = 'Öffnungszeiten weiter oben.'), 1);

-- upload adds a LOG line
insert into public.files (project_id, storage_path, name, ext, size_bytes, uploaded_by)
  values ('00000000-0000-4000-c000-000000000001', 'test/menu.pdf', 'menu', 'PDF', 10, auth.uid());
select pg_temp.eq('upload is logged', (select count(*) from public.activity_log where event = 'fileUploaded' and params ->> 'file' = 'menu.pdf'), 1);

-- reading the thread marks Rialto's message as read, not her own
reset role;
update public.messages set read_at = null where thread_id = '00000000-0000-4000-e000-000000000001';
select pg_temp.as_user('00000000-0000-4000-a000-000000000101');
select public.mark_thread_read('00000000-0000-4000-e000-000000000001');
select pg_temp.eq('team message is now read', (select count(*) from public.messages where thread_id = '00000000-0000-4000-e000-000000000001' and read_at is null and author_id = '00000000-0000-4000-a000-000000000001'), 0);
select pg_temp.eq('own messages stay unread for the team', (select count(*) from public.messages where thread_id = '00000000-0000-4000-e000-000000000001' and read_at is null and author_id = auth.uid()), 2);
select pg_temp.denied('cannot mark a foreign thread', $$select public.mark_thread_read('00000000-0000-4000-e000-000000000003')$$);
reset role;

rollback;
