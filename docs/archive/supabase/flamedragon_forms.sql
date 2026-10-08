-- Flamedragon Tyrant Form storage.
-- Run this in the Supabase SQL editor.
create table if not exists public.flamedragon_forms (
  member_id text primary key,
  name text not null,
  current_alliance text,
  infantry_tier text,
  infantry_tg text,
  cavalry_tier text,
  cavalry_tg text,
  archer_tier text,
  archer_tg text,
  heroes text[] not null default '{}',
  charms text,
  governor_gear text,
  pet_power text,
  masters_power text,
  mystic_trial_score text,
  availability text,
  voice_chat text,
  auto_help text,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.flamedragon_forms enable row level security;

drop policy if exists "Service role can manage flamedragon forms" on public.flamedragon_forms;
create policy "Service role can manage flamedragon forms"
on public.flamedragon_forms
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
