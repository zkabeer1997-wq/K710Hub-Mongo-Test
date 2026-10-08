-- Adds the 'requests' form key (Website Requests) to form_gates, so it can
-- be opened/closed from the admin Form Gates page like the other 4 member
-- intake forms. Run this in the Supabase SQL editor, after form_gates.sql.
alter table public.form_gates drop constraint if exists form_gates_key_check;
alter table public.form_gates add constraint form_gates_key_check
  check (form_key in ('lead', 'joiner', 'prep', 'dragon', 'requests'));

insert into public.form_gates (form_key, is_open)
values ('requests', true)
on conflict (form_key) do nothing;
