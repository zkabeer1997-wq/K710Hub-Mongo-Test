-- Existing events stay one-off. Recurrences are calculated from the original UTC start.
alter table public.events
  add column if not exists recurrence_frequency text not null default 'none' check (recurrence_frequency in ('none','daily','weekly','monthly','yearly')),
  add column if not exists recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 365),
  add column if not exists recurrence_until date;
