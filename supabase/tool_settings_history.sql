-- Versioned audit trail for administrator-published calculator configuration.
create table if not exists public.tool_settings_history (
  id bigint generated always as identity primary key,
  tool_key text not null,
  quantities jsonb not null,
  source_note text not null default '',
  verification_status text not null default 'community-reported'
    check (verification_status in ('verified','community-reported','experimental','deprecated')),
  last_verified date,
  created_at timestamptz not null default now()
);
create index if not exists tool_settings_history_tool_created_idx
  on public.tool_settings_history (tool_key, created_at desc);
alter table public.tool_settings_history enable row level security;
revoke all on public.tool_settings_history from anon, authenticated;
grant select, insert on public.tool_settings_history to service_role;
