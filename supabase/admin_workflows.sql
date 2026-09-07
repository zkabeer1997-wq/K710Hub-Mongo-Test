ALTER TABLE public.kingdom_guides ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'public' CHECK (access_level IN ('public','members'));
CREATE TABLE IF NOT EXISTS public.kingdom_guides_preview (LIKE public.kingdom_guides INCLUDING ALL);
ALTER TABLE public.kingdom_guides_preview ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kingdom_guides_preview FROM anon, authenticated;
GRANT ALL ON public.kingdom_guides_preview TO service_role;
INSERT INTO public.kingdom_guides_preview SELECT * FROM public.kingdom_guides ON CONFLICT DO NOTHING;
ALTER TABLE public.power_profiles ADD COLUMN IF NOT EXISTS mystic_trial_score text;
CREATE TABLE IF NOT EXISTS public.noble_advisor_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL UNIQUE, in_game_name text NOT NULL,
 want_troop_training text NOT NULL DEFAULT '', is_transfer text NOT NULL DEFAULT '', troop_speedup_days text NOT NULL DEFAULT '', promoting_t11 text NOT NULL DEFAULT '',
 avail_day4 text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.noble_advisor_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.noble_advisor_submissions FROM anon, authenticated;
GRANT ALL ON public.noble_advisor_submissions TO service_role;
CREATE TABLE IF NOT EXISTS public.tool_settings (tool_key text PRIMARY KEY, quantities jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.tool_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_settings FROM anon, authenticated;
GRANT ALL ON public.tool_settings TO service_role;
CREATE TABLE IF NOT EXISTS public.tool_settings_history (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tool_key text NOT NULL, quantities jsonb NOT NULL, source_note text NOT NULL DEFAULT '', verification_status text NOT NULL DEFAULT 'community-reported' CHECK (verification_status IN ('verified','community-reported','experimental','deprecated')), last_verified date, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS tool_settings_history_tool_created_idx ON public.tool_settings_history (tool_key, created_at DESC);
ALTER TABLE public.tool_settings_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_settings_history FROM anon, authenticated;
GRANT SELECT, INSERT ON public.tool_settings_history TO service_role;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('guide-attachments','guide-attachments',false,3145728,ARRAY['image/jpeg','image/png','image/webp','image/gif']) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.form_gates DROP CONSTRAINT IF EXISTS form_gates_key_check;
ALTER TABLE public.form_gates ADD CONSTRAINT form_gates_key_check CHECK (form_key IN ('lead','joiner','prep','dragon','noble','requests'));
INSERT INTO public.form_gates (form_key,is_open,message) VALUES ('noble',true,'') ON CONFLICT DO NOTHING;
