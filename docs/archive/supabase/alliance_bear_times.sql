-- Copy the existing public schedule once. Re-running never overwrites admin edits.
alter table public.alliances add column if not exists bear_times_utc text[];
update public.alliances set bear_times_utc = case tag
  when '710' then array['02:00','13:00']
  when 'RED' then array['11:05','19:00','23:20']
  when 'SKY' then array['12:00','20:00']
  else array[]::text[] end
where bear_times_utc is null;
alter table public.alliances alter column bear_times_utc set default array[]::text[];
alter table public.alliances alter column bear_times_utc set not null;
