alter table public.power_profiles
  add column if not exists infantry_tier text,
  add column if not exists infantry_tg text,
  add column if not exists cavalry_tier text,
  add column if not exists cavalry_tg text,
  add column if not exists archer_tier text,
  add column if not exists archer_tg text,
  add column if not exists heroes text[] not null default '{}';
