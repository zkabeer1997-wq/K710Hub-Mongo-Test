-- Gift code automation: enrollment, codes, and redemption queue.
-- Safe to run repeatedly (IF NOT EXISTS / OR REPLACE).

-- ---------------------------------------------------------------------------
-- gift_code_enrollments -- one row per member who opted into auto-redemption.
-- player_id is the in-game Member ID; kingdom is fixed to 710 for this hub.
-- ---------------------------------------------------------------------------
create table if not exists public.gift_code_enrollments (
  id              uuid primary key default gen_random_uuid(),
  member_id       text not null,
  player_id       text not null,
  kingdom         integer not null default 710,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint gift_code_enrollments_member_id_uniq unique (member_id),
  constraint gift_code_enrollments_player_kingdom_uniq unique (player_id, kingdom)
);

create index if not exists gift_code_enrollments_enabled_idx
  on public.gift_code_enrollments (enabled) where enabled = true;

alter table public.gift_code_enrollments enable row level security;

-- No public policies: all access via service role from authenticated routes.

-- ---------------------------------------------------------------------------
-- gift_codes -- discovered or manually added codes.
-- ---------------------------------------------------------------------------
create table if not exists public.gift_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  source          text not null default 'wiki',
  discovered_at   timestamptz not null default now(),
  active          boolean not null default true,
  expired_at      timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint gift_codes_code_uniq unique (code)
);

create index if not exists gift_codes_active_idx
  on public.gift_codes (active) where active = true;

alter table public.gift_codes enable row level security;

-- ---------------------------------------------------------------------------
-- gift_code_redemptions -- unique per player + kingdom + code.
-- status lifecycle: pending -> processing -> redeemed | already_redeemed |
--   expired | invalid_code | invalid_player | temporary_failure | captcha | unknown
-- ---------------------------------------------------------------------------
create table if not exists public.gift_code_redemptions (
  id              uuid primary key default gen_random_uuid(),
  enrollment_id   uuid references public.gift_code_enrollments(id) on delete set null,
  player_id       text not null,
  kingdom         integer not null default 710,
  code_id         uuid not null references public.gift_codes(id) on delete cascade,
  code            text not null,
  status          text not null default 'pending',
  attempts        integer not null default 0,
  next_retry_at   timestamptz,
  last_response   text,
  locked_at       timestamptz,
  locked_by       text,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint gift_code_redemptions_player_code_uniq unique (player_id, kingdom, code)
);

create index if not exists gift_code_redemptions_status_retry_idx
  on public.gift_code_redemptions (status, next_retry_at)
  where status in ('pending', 'temporary_failure');

create index if not exists gift_code_redemptions_player_idx
  on public.gift_code_redemptions (player_id);

alter table public.gift_code_redemptions enable row level security;

-- ---------------------------------------------------------------------------
-- gift_code_wiki_checks -- audit of wiki scrape runs
-- ---------------------------------------------------------------------------
create table if not exists public.gift_code_wiki_checks (
  id              uuid primary key default gen_random_uuid(),
  checked_at      timestamptz not null default now(),
  success         boolean not null,
  codes_found     integer not null default 0,
  new_codes       integer not null default 0,
  error_message   text,
  raw_snippet     text
);

-- ---------------------------------------------------------------------------
-- Helper: queue active codes for an enrollment (or all enabled).
-- ---------------------------------------------------------------------------
create or replace function public.gift_code_queue_for_enrollment(p_enrollment_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_enroll record;
  v_inserted integer := 0;
begin
  select * into v_enroll
  from public.gift_code_enrollments
  where id = p_enrollment_id and enabled = true;

  if not found then
    return 0;
  end if;

  insert into public.gift_code_redemptions (
    enrollment_id, player_id, kingdom, code_id, code, status
  )
  select
    v_enroll.id,
    v_enroll.player_id,
    v_enroll.kingdom,
    gc.id,
    gc.code,
    'pending'
  from public.gift_codes gc
  where gc.active = true
  on conflict (player_id, kingdom, code) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: enroll a member and queue current active codes.
-- ---------------------------------------------------------------------------
create or replace function public.gift_code_enroll_member(
  p_member_id text,
  p_player_id text,
  p_kingdom integer default 710
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  insert into public.gift_code_enrollments (member_id, player_id, kingdom, enabled)
  values (btrim(p_member_id), btrim(p_player_id), coalesce(p_kingdom, 710), true)
  on conflict (member_id) do update
    set player_id = excluded.player_id,
        kingdom = excluded.kingdom,
        enabled = true,
        updated_at = now()
  returning id into v_id;

  perform public.gift_code_queue_for_enrollment(v_id);
  return v_id;
end;
$$;

-- These are called only from server-side admin/API routes with the service
-- role key; the public/anon/authenticated roles must never call them directly
-- over the PostgREST RPC endpoint.
revoke all on function public.gift_code_queue_for_enrollment(uuid) from public, anon, authenticated;
revoke all on function public.gift_code_enroll_member(text, text, integer) from public, anon, authenticated;
