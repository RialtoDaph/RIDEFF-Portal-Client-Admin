-- Step 2 · client area: approvals, chat, files, storage.

-- What the approval card says after an approval ("NÄCHSTER SCHRITT: TESTLAUF DO").
alter table public.items add column after_approval public.l10n;

-- ── files: both client roles may upload (owner decision, Oct 2026) ────
alter policy files_insert on public.files with check (
  uploaded_by = auth.uid() and (
    private.is_member(private.project_org(project_id)) or private.has_staff_role('support', 'builder')
  )
);

-- Every upload appears in the LOG.
create function private.log_file_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_log (org_id, project_id, actor_id, tag, event, params)
  values (
    private.project_org(new.project_id), new.project_id, new.uploaded_by, 'datei', 'fileUploaded',
    jsonb_build_object('file', new.name || case when new.ext <> '' then '.' || lower(new.ext) else '' end)
  );
  return new;
end $$;
create trigger files_log after insert on public.files
  for each row execute function private.log_file_upload();

-- ── approvals ─────────────────────────────────────────────────────────
-- Only an Inhaber decides. A change request also goes into the item's thread,
-- so the team sees it in the inbox.
create function public.decide_item(p_item uuid, p_decision public.item_status, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  it public.items%rowtype;
  org uuid;
  comment text := nullif(trim(coalesce(p_comment, '')), '');
  thread uuid;
begin
  select * into it from public.items where id = p_item for update;
  if not found then raise exception 'item not found' using errcode = 'P0002'; end if;
  org := private.project_org(it.project_id);
  if not private.is_inhaber(org) then raise exception 'only the Inhaber can decide' using errcode = '42501'; end if;
  if it.kind <> 'approval' or it.status <> 'open' then raise exception 'item is not open' using errcode = '22023'; end if;
  if p_decision = 'open' then raise exception 'invalid decision' using errcode = '22023'; end if;
  if p_decision = 'changes_requested' and comment is null then raise exception 'comment required' using errcode = '22023'; end if;
  if length(comment) > 5000 then raise exception 'comment too long' using errcode = '22001'; end if;

  update public.items set status = p_decision, decided_at = now(), decided_by = auth.uid() where id = p_item;
  insert into public.item_decisions (item_id, user_id, decision, comment) values (p_item, auth.uid(), p_decision, comment);

  if p_decision = 'approved' then
    insert into public.activity_log (org_id, project_id, actor_id, tag, event, params)
    values (org, it.project_id, auth.uid(), 'freigabe', 'itemApproved', jsonb_build_object('title', it.title));
  else
    insert into public.activity_log (org_id, project_id, actor_id, tag, event, params)
    values (org, it.project_id, auth.uid(), 'wunsch', 'changeRequested', jsonb_build_object('title', it.title, 'text', comment));
    select id into thread from public.threads where item_id = p_item;
    if thread is null then
      insert into public.threads (project_id, item_id) values (it.project_id, p_item) returning id into thread;
    end if;
    insert into public.messages (thread_id, author_id, body) values (thread, auth.uid(), comment);
  end if;
end $$;

-- "RÜCKGÄNGIG": the same person may undo within 15 minutes. A change request already
-- posted to the thread stays there.
create function public.undo_item_decision(p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  it public.items%rowtype;
begin
  select * into it from public.items where id = p_item for update;
  if not found then raise exception 'item not found' using errcode = 'P0002'; end if;
  if not private.is_inhaber(private.project_org(it.project_id)) then raise exception 'only the Inhaber can decide' using errcode = '42501'; end if;
  if it.status = 'open' or it.decided_by is distinct from auth.uid() or it.decided_at < now() - interval '15 minutes' then
    raise exception 'decision can no longer be undone' using errcode = '22023';
  end if;
  update public.items set status = 'open', decided_at = null, decided_by = null where id = p_item;
  -- keep the audit trail: the client no longer sees the line, the team sees it marked as undone
  update public.activity_log set client_visible = false, params = params || '{"undone": true}'::jsonb
   where project_id = it.project_id and actor_id = auth.uid() and created_at >= it.decided_at
     and event in ('itemApproved', 'changeRequested');
end $$;

-- ── chat ──────────────────────────────────────────────────────────────
-- Marks the other side's messages in a thread as read.
create function public.mark_thread_read(p_thread uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_member(private.thread_org(p_thread)) or private.has_staff_role('support', 'builder')) then
    raise exception 'no access' using errcode = '42501';
  end if;
  update public.messages m set read_at = now()
   where m.thread_id = p_thread and m.read_at is null and m.author_id <> auth.uid()
     and private.is_staff_user(m.author_id) <> private.is_staff_user(auth.uid());
end $$;

revoke execute on function public.decide_item(uuid, public.item_status, text) from public, anon;
revoke execute on function public.undo_item_decision(uuid) from public, anon;
revoke execute on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.decide_item(uuid, public.item_status, text) to authenticated;
grant execute on function public.undo_item_decision(uuid) to authenticated;
grant execute on function public.mark_thread_read(uuid) to authenticated;
revoke all on function private.log_file_upload() from public, anon, authenticated;

-- Live chat: Realtime delivers inserts, filtered by the same RLS as selects.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ── storage ───────────────────────────────────────────────────────────
-- Paths: files/{org_id}/{project_id}/{uuid}-{name}, previews/{org_id}/{project_id}/{item_id}-{desktop|mobile}.{ext}
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('files', 'files', false, 52428800), ('previews', 'previews', false, 10485760)
    on conflict (id) do nothing;

    execute $p$
      create policy files_read on storage.objects for select to authenticated using (
        bucket_id in ('files', 'previews') and (
          private.is_member(((storage.foldername(name))[1])::uuid)
          or private.has_staff_role('support', 'builder')
        )
      )$p$;
    execute $p$
      create policy files_upload on storage.objects for insert to authenticated with check (
        (bucket_id = 'files' and (
          private.is_member(((storage.foldername(name))[1])::uuid)
          or private.has_staff_role('support', 'builder')
        ))
        or (bucket_id = 'previews' and private.has_staff_role('builder'))
      )$p$;
  end if;
end $$;
