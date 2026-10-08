-- Latest saved calculator/tool state per member.
-- Browser roles have no table grants; access is through the server-side API only.
create table if not exists public.member_tool_state (
  member_id text not null,
  tool_key text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (member_id, tool_key)
);

alter table public.member_tool_state enable row level security;
revoke all on table public.member_tool_state from anon, authenticated;
grant select, insert, update, delete on table public.member_tool_state to service_role;
