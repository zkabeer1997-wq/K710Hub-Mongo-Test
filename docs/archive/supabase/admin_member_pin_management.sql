-- Admin member PIN management.
-- Existing PINs remain one-way bcrypt hashes and are never exposed.

create or replace function public.admin_reset_member_pin(
  p_member_id text,
  p_new_pin text
)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
begin
  if p_member_id is null or btrim(p_member_id) = '' then
    return false;
  end if;

  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be exactly 6 digits';
  end if;

  update public.submissions
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10))
  where member_id = p_member_id;

  return found;
end;
$$;

revoke all on function public.admin_reset_member_pin(text, text) from public;
revoke all on function public.admin_reset_member_pin(text, text) from anon;
revoke all on function public.admin_reset_member_pin(text, text) from authenticated;
grant execute on function public.admin_reset_member_pin(text, text) to service_role;

-- Unknown Member IDs must never authenticate, and malformed legacy/admin-created
-- PIN values should fail closed instead of throwing an invalid-salt error.
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
    where member_id = p_member_id
  ), false);
$$;

revoke all on function public.verify_page_pin(text, text) from public;
revoke all on function public.verify_page_pin(text, text) from anon;
revoke all on function public.verify_page_pin(text, text) from authenticated;
grant execute on function public.verify_page_pin(text, text) to service_role;
