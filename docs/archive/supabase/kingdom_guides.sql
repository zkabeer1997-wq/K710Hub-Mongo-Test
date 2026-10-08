-- Server-managed guide content for the Kingdom 710 Guides library.
create table if not exists public.kingdom_guides (
  slug text primary key,
  title text not null,
  category text not null default 'Kingdom Guide',
  description text not null default '',
  body text not null default '',
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kingdom_guides_slug_format check (slug ~ '^[a-z0-9-]{1,80}$')
);

alter table public.kingdom_guides enable row level security;
revoke all on table public.kingdom_guides from anon, authenticated;
grant select, insert, update, delete on table public.kingdom_guides to service_role;

insert into public.kingdom_guides (slug, title, category, description, body, position, is_published)
values
  (
    'rally-lead',
    'Rally Lead Guide',
    'Battle Guide',
    'A living reference for rally leads: preparation, composition, timing, and battlefield responsibilities.',
    'Use this page as the kingdom''s living rally-lead reference.\n\nSuggested topics to maintain here:\n- Pre-battle preparation\n- Hero and troop setup\n- Rally timing\n- Communication expectations\n- Common mistakes\n\nLog in as an admin to replace this starter text with the full guide.',
    10,
    true
  ),
  (
    'rally-joiner',
    'Rally Joiner Guide',
    'Battle Guide',
    'How rally joiners should prepare, select heroes, reinforce, and respond during coordinated kingdom battles.',
    'Use this page as the kingdom''s living rally-joiner reference.\n\nSuggested topics to maintain here:\n- Recommended joiner heroes\n- Troop composition\n- Reinforcement priorities\n- Timing and communication\n- What to avoid\n\nLog in as an admin to replace this starter text with the full guide.',
    20,
    true
  ),
  (
    'kvk-preparation',
    'KvK Preparation Guide',
    'Event Guide',
    'A central checklist and reference for preparing accounts, resources, upgrades, and coordination before KvK.',
    'Use this page as the kingdom''s living KvK preparation reference.\n\nSuggested topics to maintain here:\n- Resource planning\n- Speedup planning\n- Upgrade timing\n- Event-day priorities\n- Kingdom coordination\n\nLog in as an admin to replace this starter text with the full guide.',
    30,
    true
  )
on conflict (slug) do nothing;
