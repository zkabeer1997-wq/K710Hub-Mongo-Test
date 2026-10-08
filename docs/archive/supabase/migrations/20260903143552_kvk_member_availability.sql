-- Save both fields atomically after checking the member PIN. Called only by
-- the server endpoint, which also requires a session matching this member ID.
-- The existing troop/profile columns and legacy RPC remain unchanged.
create or replace function public.save_kvk_availability(
  p_member_id text, p_name text, p_current_alliance text, p_availability text, p_pin text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_hash text;
  saved jsonb;
begin
  if nullif(btrim(p_member_id), '') is null or nullif(btrim(p_name), '') is null
     or nullif(p_pin, '') is null then
    raise exception 'INVALID_INPUT';
  end if;
  if p_current_alliance is null or p_current_alliance not in ('710', 'RED', 'SKY')
     or p_availability is null or p_availability not in (
       'First half (12-14:30 UTC)', 'Second half (14:30-17 UTC)',
       'Full battle (12-17 UTC)', 'Not Available'
     ) then
    raise exception 'INVALID_INPUT';
  end if;
  select pin_hash into existing_hash from public.submissions
    where member_id = btrim(p_member_id) for update;
  if existing_hash is null or existing_hash !~ '^\$2[aby]\$[0-9]{2}\$' then
    raise exception 'PIN_MISMATCH';
  end if;
  if existing_hash <> extensions.crypt(p_pin, existing_hash) then
    raise exception 'PIN_MISMATCH';
  end if;
  update public.submissions set
    name = btrim(p_name), current_alliance = p_current_alliance,
    availability = p_availability, updated_at = now()
    where member_id = btrim(p_member_id)
    returning jsonb_build_object(
      'name', name, 'member_id', member_id, 'current_alliance', current_alliance,
      'availability', availability, 'updated_at', updated_at
    ) into saved;
  return saved;
end;
$$;
revoke all on function public.save_kvk_availability(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_kvk_availability(text, text, text, text, text) to service_role;
