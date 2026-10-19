-- RLS helper functions live in a schema the REST API does not expose,
-- so they can't be called as /rest/v1/rpc/... (Supabase security advisor 0028/0029).
-- Policies keep working: they reference the functions by OID.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_staff() set schema private;
alter function public.has_staff_role(variadic public.staff_role[]) set schema private;
alter function public.is_member(uuid) set schema private;
alter function public.is_inhaber(uuid) set schema private;
alter function public.project_org(uuid) set schema private;
alter function public.thread_org(uuid) set schema private;
alter function public.item_org(uuid) set schema private;
alter function public.shares_org_with(uuid) set schema private;
alter function public.is_staff_user(uuid) set schema private;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- mark_totp_enabled() calls is_aal2() only; the trigger function is never called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_aal2() from public, anon;
grant execute on function public.is_aal2() to authenticated;
