-- Canonicalize Member IDs and make PIN/reset flows resilient to legacy whitespace.

-- The submissions table has a UNIQUE(member_id) constraint. Abort rather than
-- accidentally collapsing two historical IDs if canonicalization would collide.
do $$
begin
  if exists (
    select 1
    from public.submissions
    group by btrim(member_id)
    having count(*) > 1
  ) then
    raise exception 'Cannot normalize submissions.member_id: trimmed ID collision detected';
  end if;
end;
$$;

update public.submissions
set member_id = btrim(member_id)
where member_id <> btrim(member_id);

-- Keep the legacy member access registry aligned where it contains the same
-- whitespace issue. No active session rows currently reference these malformed
-- IDs, so this primary-key cleanup is safe.
update public.member_access_v2_accounts
set member_id = btrim(member_id)
where member_id <> btrim(member_id);

create or replace function public.admin_reset_member_pin(
  p_member_id text,
  p_new_pin text
)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_member_id text := btrim(p_member_id);
begin
  if v_member_id is null or v_member_id = '' then
    return false;
  end if;

  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be exactly 6 digits';
  end if;

  update public.submissions
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where btrim(member_id) = v_member_id;

  return found;
end;
$$;

revoke all on function public.admin_reset_member_pin(text, text) from public;
revoke all on function public.admin_reset_member_pin(text, text) from anon;
revoke all on function public.admin_reset_member_pin(text, text) from authenticated;
grant execute on function public.admin_reset_member_pin(text, text) to service_role;

create or replace function public.verify_page_pin(
  p_member_id text,
  p_pin text
)
returns boolean
language sql
security definer
set search_path = 'public', 'extensions'
as $$
  select coalesce((
    select case
      when pin_hash ~ '^\$2[aby]\$[0-9]{2}\$'
        then pin_hash = extensions.crypt(p_pin, pin_hash)
      else false
    end
    from public.submissions
    where btrim(member_id) = btrim(p_member_id)
  ), false);
$$;

revoke all on function public.verify_page_pin(text, text) from public;
revoke all on function public.verify_page_pin(text, text) from anon;
revoke all on function public.verify_page_pin(text, text) from authenticated;
grant execute on function public.verify_page_pin(text, text) to service_role;

create or replace function public.submit_troop_form(
  p_name text,
  p_member_id text,
  p_infantry_tier text,
  p_infantry_tg text,
  p_cavalry_tier text,
  p_cavalry_tg text,
  p_archer_tier text,
  p_archer_tg text,
  p_heroes text[],
  p_availability text,
  p_pin text
)
returns text
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  existing_hash text;
  v_member_id text := btrim(p_member_id);
begin
  if v_member_id is null or v_member_id = '' then
    raise exception 'MEMBER_ID_REQUIRED';
  end if;

  select pin_hash
  into existing_hash
  from public.submissions
  where member_id = v_member_id;

  if existing_hash is null then
    insert into public.submissions(
      name, member_id, infantry_tier, infantry_tg, cavalry_tier, cavalry_tg,
      archer_tier, archer_tg, heroes, availability, pin_hash
    ) values (
      p_name, v_member_id, p_infantry_tier, p_infantry_tg, p_cavalry_tier, p_cavalry_tg,
      p_archer_tier, p_archer_tg, p_heroes, p_availability, extensions.crypt(p_pin, extensions.gen_salt('bf'))
    );
    return 'created';
  end if;

  if existing_hash = extensions.crypt(p_pin, existing_hash) then
    update public.submissions set
      name = p_name,
      infantry_tier = p_infantry_tier,
      infantry_tg = p_infantry_tg,
      cavalry_tier = p_cavalry_tier,
      cavalry_tg = p_cavalry_tg,
      archer_tier = p_archer_tier,
      archer_tg = p_archer_tg,
      heroes = p_heroes,
      availability = p_availability,
      updated_at = now()
    where member_id = v_member_id;
    return 'updated';
  end if;

  raise exception 'PIN_MISMATCH';
end;
$$;
