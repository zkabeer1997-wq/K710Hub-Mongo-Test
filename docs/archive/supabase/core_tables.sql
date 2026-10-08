-- Core tables: submissions, content_blocks, public_submissions, verify_page_pin
--
-- These four objects carry most of the app's traffic but had no DDL in the
-- repo -- they existed only in the live project, which made the environment
-- unreproducible. Reconstructed from the live schema (Postgres 17), not from
-- guesswork, so this file matches production as of PR 1.
--
-- Safe to run against the existing project: every statement is guarded with
-- "if not exists" / "or replace" and no statement drops or alters a column.

-- ---------------------------------------------------------------------------
-- submissions -- the member roster. One row per member, keyed by in-game
-- member_id. pin_hash is a bcrypt digest written via extensions.crypt().
-- ---------------------------------------------------------------------------

create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  member_id      text not null unique,
  infantry_tier  text,
  infantry_tg    text,
  cavalry_tier   text,
  cavalry_tg     text,
  archer_tier    text,
  archer_tg      text,
  heroes         text[] not null default '{}'::text[],
  availability   text,
  pin_hash       text not null,
  current_alliance text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.submissions enable row level security;

-- No policy is defined on purpose. RLS enabled with zero permissive policies
-- denies anon and authenticated outright; all access goes through server-side
-- routes using the service role. See the grant hygiene note at the bottom.

-- ---------------------------------------------------------------------------
-- public_submissions -- sanitised projection of the roster.
--
-- Deliberately omits pin_hash and current_alliance. security_invoker is false,
-- so the view runs with its owner's rights and therefore reads through the
-- RLS on submissions. That is what makes it readable at all.
--
-- Read by exactly one caller: app/player-record/PlayerRecordForm.js, using the
-- anon key, to prefill a member's own record. See the exposure note at the
-- bottom before adding a second caller.
-- ---------------------------------------------------------------------------

create or replace view public.public_submissions as
  select
    id, name, member_id,
    infantry_tier, infantry_tg,
    cavalry_tier, cavalry_tg,
    archer_tier, archer_tg,
    heroes, availability,
    created_at, updated_at
  from public.submissions;

alter view public.public_submissions set (security_invoker = false);

-- ---------------------------------------------------------------------------
-- content_blocks -- admin-editable page copy and images.
--
-- content is a jsonb bag whose shape depends on type:
--   heading -> { text }
--   text    -> { key?, text }   (key is set for the self-seeding home copy)
--   image   -> { url, alt? }
--
-- The partial unique index on (page, content->>'key') is what makes the
-- idempotent upsert in lib/homeContent.js work; without it that seed
-- double-inserts on every render.
-- ---------------------------------------------------------------------------

create table if not exists public.content_blocks (
  id         uuid primary key default gen_random_uuid(),
  page       text not null,
  position   integer not null default 0,
  type       text not null check (type in ('heading', 'text', 'image')),
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_blocks_page_position_idx
  on public.content_blocks using btree (page, "position");

create unique index if not exists content_blocks_home_key_uniq
  on public.content_blocks using btree (page, ((content ->> 'key')))
  where ((content ->> 'key') is not null);

alter table public.content_blocks enable row level security;

-- Site copy is public by design; writes go through the admin-gated
-- /api/admin-content routes with the service role.
drop policy if exists "Public read content_blocks" on public.content_blocks;
create policy "Public read content_blocks"
  on public.content_blocks for select
  using (true);

-- ---------------------------------------------------------------------------
-- verify_page_pin -- member PIN check used by /api/member-login.
--
-- SECURITY DEFINER so it can read submissions.pin_hash despite RLS. Returns a
-- plain boolean and never leaks the hash. The regex guard means a row whose
-- pin_hash is not a bcrypt digest fails closed rather than comparing loosely.
-- btrim on both sides tolerates the legacy whitespace in member_id that
-- fix_member_id_whitespace.sql cleans up.
-- ---------------------------------------------------------------------------

create or replace function public.verify_page_pin(p_member_id text, p_pin text)
returns boolean
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  select coalesce((
    select case
      when pin_hash ~ '^\$2[aby]\$[0-9]{2}\$'
        then pin_hash = extensions.crypt(p_pin, pin_hash)
      else false
    end
    from public.submissions
    where btrim(member_id) = btrim(p_member_id)
  ), false);
$function$;

-- ---------------------------------------------------------------------------
-- Grant hygiene -- NOT YET APPLIED. Read this before running the block below.
--
-- submissions and content_blocks predate the "revoke all from anon" pattern
-- that the newer tables (kingdom_guides, member_tool_state, power_profiles)
-- follow. Both still carry anon/authenticated INSERT, UPDATE, DELETE and
-- TRUNCATE grants.
--
-- Those grants are currently inert: submissions has RLS on with no policy at
-- all, and content_blocks has only a SELECT policy, so writes are refused.
-- There is no live vulnerability today.
--
-- The risk is latent rather than active. The moment someone adds a broad
-- policy (FOR ALL instead of FOR SELECT, or USING (true) while debugging) or
-- toggles RLS off for a minute, anon gains write access to a 193-member
-- roster -- because the grants underneath were never removed. Defence in
-- depth means not relying on the absence of a policy as the only lock.
--
-- Applying this changes no behaviour today. Verify on a branch first.
--
--   revoke all on table public.submissions   from anon, authenticated;
--   revoke all on table public.content_blocks from anon, authenticated;
--   grant select, insert, update, delete on table public.submissions    to service_role;
--   grant select, insert, update, delete on table public.content_blocks to service_role;
--   -- public_submissions must keep its anon select, or PlayerRecordForm breaks:
--   grant select on table public.public_submissions to anon;
--
-- ---------------------------------------------------------------------------
-- Roster exposure -- a decision, not a bug.
--
-- public_submissions is readable with the anon key, and the anon key ships in
-- the client bundle as NEXT_PUBLIC_SUPABASE_ANON_KEY. Anyone who opens
-- devtools can therefore read all 193 members' in-game name, member_id, per-
-- unit troop tier and truegold, hero roster, and availability. For a kingdom
-- in active KvK that is a full combat-readiness roster handed to any rival who
-- looks.
--
-- Only one caller needs it, and only for the requesting member's own row.
-- Moving that lookup to a member-session-gated server route would let this
-- view be locked down or dropped. Tracked for the Wave 5 auth-boundary work.
-- ---------------------------------------------------------------------------
