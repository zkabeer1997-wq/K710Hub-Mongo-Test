create extension if not exists pgcrypto;

create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  image_url text not null,
  title text not null default '',
  caption text not null default '',
  alt_text text not null,
  position integer not null default 0 check (position >= 0 and position <= 100000),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gallery_images enable row level security;

drop policy if exists "Public can view published gallery images" on public.gallery_images;
create policy "Public can view published gallery images"
on public.gallery_images for select
to anon, authenticated
using (is_published = true);

grant select on public.gallery_images to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kingdom-gallery',
  'kingdom-gallery',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

