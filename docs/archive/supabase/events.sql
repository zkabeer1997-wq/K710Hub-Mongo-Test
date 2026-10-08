-- Public events: one-off calendar entries (KvK windows, Championship,
-- Swordland, custom kingdom events). The recurring daily Bear Hunt
-- schedule is NOT stored here - it's a fixed, real daily UTC-time
-- schedule (lib/bearHuntSchedule.js), not a general recurrence pattern,
-- so a full RRULE engine would be solving a problem this game doesn't
-- have. This table exists for events that actually have their own date,
-- description, and detail page.
--
-- Same pattern as kingdom_guides.sql: RLS enabled, no anon/authenticated
-- grants at all, service_role only. Published/unpublished filtering
-- happens in application code (see app/events/*), exactly like guides -
-- kept consistent rather than inventing a second convention.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  kind text not null default 'custom',
  description text not null default '',
  body_md text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  published boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_slug_format check (slug ~ '^[a-z0-9-]{1,80}$'),
  constraint events_kind_check check (kind in ('kvk', 'championship', 'swordland', 'custom'))
);

create index if not exists events_starts_at_idx on public.events (starts_at);

alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;
grant select, insert, update, delete on table public.events to service_role;
