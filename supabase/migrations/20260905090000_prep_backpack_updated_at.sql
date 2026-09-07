alter table public.prep_backpack_submissions
  add column if not exists updated_at timestamptz;

update public.prep_backpack_submissions
set updated_at = created_at
where updated_at is null;

alter table public.prep_backpack_submissions
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists prep_backpack_submissions_updated_at_idx
  on public.prep_backpack_submissions (updated_at desc);
