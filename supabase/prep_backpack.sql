create table if not exists public.prep_backpack_submissions (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  in_game_name text not null,
  want_construction text default '',
  construction_upgrades text[] not null default '{}',
  ttg_used text default '',
  tg_used text default '',
  want_research text default '',
  t11_troops text[] not null default '{}',
  tg_dust text default '',
  research_speedup_days text default '',
  want_troop_training text default '',
  is_transfer text default '',
  troop_speedup_days text default '',
  promoting_t11 text default '',
  avail_day1 text[] not null default '{}',
  avail_day2 text[] not null default '{}',
  avail_day4 text[] not null default '{}',
  avail_day5 text[] not null default '{}',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prep_backpack_submissions
  add column if not exists updated_at timestamptz not null default now();

alter table public.prep_backpack_submissions enable row level security;
