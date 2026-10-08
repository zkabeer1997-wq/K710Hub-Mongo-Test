-- Per-form open/closed switches for the 4 member intake forms linked from
-- MusterHall (/forms). Lets an admin close one form (e.g. the KvK
-- Availability form) while a timed event form (e.g. Flamedragon Tyrant)
-- stays open, without touching code or deploying.
--
-- Same pattern as alliances/events: RLS enabled, no anon/authenticated
-- grants, service_role only. `form_key` is the stable identifier already
-- used in MusterHall.jsx's STATIONS array (lead/joiner/prep/dragon).
create table if not exists public.form_gates (
  form_key text primary key,
  is_open boolean not null default true,
  message text not null default '',
  updated_at timestamptz not null default now(),
  constraint form_gates_key_check check (form_key in ('lead', 'joiner', 'prep', 'dragon'))
);

alter table public.form_gates enable row level security;
revoke all on table public.form_gates from anon, authenticated;
grant select, insert, update, delete on table public.form_gates to service_role;

insert into public.form_gates (form_key, is_open)
values
  ('lead', true),
  ('joiner', true),
  ('prep', true),
  ('dragon', true)
on conflict (form_key) do nothing;
