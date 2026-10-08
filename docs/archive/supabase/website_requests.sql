-- Website Requests storage: a running log of improvement suggestions
-- submitted by signed-in members from /forms/requests. Unlike the other
-- member forms (KvK Availability, Player Profile, Flamedragon Tyrant),
-- each submission is its own row rather than overwriting a prior one, so
-- a member can send several different suggestions over time and the admin
-- review queue keeps every one of them.
-- Run this in the Supabase SQL editor.
create table if not exists public.website_requests (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  name text not null,
  current_alliance text,
  section text not null,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint website_requests_section_check check (section in (
    'Tools and Calculators', 'Forms', 'Events', 'Guides', 'General'
  )),
  constraint website_requests_status_check check (status in ('new', 'reviewed'))
);

create index if not exists website_requests_created_at_idx on public.website_requests (created_at desc);

alter table public.website_requests enable row level security;
revoke all on table public.website_requests from anon, authenticated;
grant select, insert, update, delete on table public.website_requests to service_role;
