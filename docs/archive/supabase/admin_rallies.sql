create table if not exists public.admin_rallies (
  id text primary key,
  name text not null,
  position integer not null,
  member_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.admin_rallies enable row level security;

alter table public.admin_rallies
  add column if not exists lead_member_id text,
  add column if not exists formation jsonb not null default '{"infantry": 0, "cavalry": 0, "archer": 0}'::jsonb;
