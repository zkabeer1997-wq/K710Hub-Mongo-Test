-- Alliance schedules use the existing server-only alliances permissions.
-- Safe to rerun; existing schedules are preserved.
ALTER TABLE public.alliances
  ADD COLUMN IF NOT EXISTS scheduled_events jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(scheduled_events) = 'array' AND jsonb_array_length(scheduled_events) <= 100);
