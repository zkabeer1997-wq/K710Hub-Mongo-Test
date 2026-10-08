-- Admin-only member creation with an initial PIN.
-- The plaintext PIN is never stored; only a bcrypt hash is persisted.

create or replace function public.admin_create_member_with_pin(
  p_name text,
  p_member_id text,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Name is required';
  end if;

  if p_member_id is null or btrim(p_member_id) = '' then
    raise exception 'Member ID is required';
  end if;

  if length(btrim(p_member_id)) > 120 then
    raise exception 'Member ID is too long';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be exactly 6 digits';
  end if;

  insert into public.submissions (
    name,
    member_id,
    heroes,
    pin_hash,
    updated_at
  ) values (
    btrim(p_name),
    btrim(p_member_id),
    '{}'::text[],
    extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    now()
  );

  return true;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.admin_create_member_with_pin(text, text, text) from public;
revoke all on function public.admin_create_member_with_pin(text, text, text) from anon;
revoke all on function public.admin_create_member_with_pin(text, text, text) from authenticated;
grant execute on function public.admin_create_member_with_pin(text, text, text) to service_role;
