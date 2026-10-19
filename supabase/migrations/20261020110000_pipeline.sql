-- Step 8.8 · pipeline actions: add leads, move them between stages, mark them lost.
alter type public.lead_stage add value if not exists 'lost';
alter table public.leads
  add column phone text,
  add column source text,
  add column lost_reason text,
  add column stage_changed_at timestamptz not null default now();
