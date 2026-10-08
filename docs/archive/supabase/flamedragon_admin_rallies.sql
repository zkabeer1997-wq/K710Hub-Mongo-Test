-- Rally planner storage for the Flamedragon Tyrant admin tab.
-- Mirrors admin_rallies.sql but kept as its own table so Flamedragon rallies
-- stay independent from the KvK Members rally board.
create table if not exists public.flamedragon_admin_rallies (
  id text primary key,
  name text not null,
  position integer not null,
  member_ids text[] not null default '{}',
  lead_member_id text,
  formation jsonb not null default '{"infantry": 0, "cavalry": 0, "archer": 0}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.flamedragon_admin_rallies enable row level security;

drop policy if exists "Service role can manage flamedragon rallies" on public.flamedragon_admin_rallies;
create policy "Service role can manage flamedragon rallies"
on public.flamedragon_admin_rallies
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
