-- Temporary switch: the owner can make TOTP 2FA optional for staff (settings.require_staff_2fa).
-- Missing or true = required, as before. The owner switches it in Einstellungen (Anmeldung).
create or replace function public.is_aal2() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or coalesce((select value from public.settings where key = 'require_staff_2fa'), 'true'::jsonb) = 'false'::jsonb
$$;
