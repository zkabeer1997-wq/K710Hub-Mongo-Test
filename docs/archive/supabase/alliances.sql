-- Alliance directory. `tag` is the primary key rather than a surrogate
-- uuid, since 710/RED/SKY are the real, stable identifiers already used
-- everywhere else in this codebase (--wb-* heraldry tokens, Tag's `band`
-- prop, data-band selectors in kingdom.css) - one identifier, not two.
--
-- Same pattern as kingdom_guides / events: RLS enabled, no anon/
-- authenticated grants, service_role only, published ("active") filtering
-- in application code.
create table if not exists public.alliances (
  tag text primary key,
  name text not null,
  blurb text not null default '',
  leader_player_id text,
  timezone_focus text,
  recruiting_status text not null default 'open',
  language text,
  roster_size integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alliances_tag_format check (tag ~ '^[A-Z0-9]{2,10}$'),
  constraint alliances_recruiting_status_check check (recruiting_status in ('open', 'selective', 'closed'))
);

alter table public.alliances enable row level security;
revoke all on table public.alliances from anon, authenticated;
grant select, insert, update, delete on table public.alliances to service_role;

-- Seed with what's already public (the same one-line hunt-timing blurbs
-- already shown on / and /chronometer via content_blocks, wb-1/2/3-desc) -
-- not a migration of those rows, just equivalent starting copy so this
-- table isn't empty on day one. Real roster size, leader, timezone focus,
-- and language are left null rather than invented; an admin fills them in.
insert into public.alliances (tag, name, blurb, recruiting_status, sort_order)
values
  ('710', '710', 'Two hunts a day, anchoring the early and midday windows.', 'open', 10),
  ('RED', 'RED', 'Three hunts, running from EU evening through NA late night.', 'open', 20),
  ('SKY', 'SKY', 'Two hunts anchoring the SEA / AU daytime window.', 'open', 30)
on conflict (tag) do nothing;
