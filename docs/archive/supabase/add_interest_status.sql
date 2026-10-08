-- Adds application status tracking to interest_submissions.
-- status values used by the admin dashboard: pending, special, normal, reject, waitlist.
alter table public.interest_submissions
  add column if not exists status text not null default 'pending',
  add column if not exists decided_at timestamptz;

-- On accept (status = special or normal) the admin API creates:
--   * a player record in public.submissions (via submit_troop_form RPC)
--   * a player profile in public.power_profiles
-- using the applicant's player_id as member_id and a default password of '710-<player_id>'.
