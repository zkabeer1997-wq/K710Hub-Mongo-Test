-- Independent categories remain visible even before they contain published guides.
create table if not exists public.guide_categories (
  name text primary key check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index if not exists guide_categories_name_lower on public.guide_categories (lower(name));
alter table public.guide_categories enable row level security;
revoke all on public.guide_categories from anon, authenticated;
grant select, insert, update, delete on public.guide_categories to service_role;
insert into public.guide_categories (name)
select distinct trim(category) from public.kingdom_guides where trim(category) <> ''
on conflict do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guide-images', 'guide-images', true, 3145728, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
