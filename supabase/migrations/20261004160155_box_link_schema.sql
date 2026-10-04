/*
# Box link: schema for integration contract v1

Plain English: prepares the database so the box (Will's Python server) can push the
source catalogue, market observations, released briefs (with PDFs) and heartbeats, and
so an app admin can pause the link and watch its health.

1. New tables
- `app_admins` (user_id, email, added_at): platform admins, kept in step with the
  ADMIN_EMAILS secret by the admin-sync function. Users can read only their own row.
- `box_link_settings` (single row id=1: accept_data, updated_by, updated_at): the
  "Accept data from the box" switch. Admin read only; changed through a checked function.
- `ingest_runs` (one row per box call: request_id, endpoint, run_id, http_status, ok,
  error_code, detail, received/inserted/updated, rejected, warnings, caller_ip, key_label,
  started_at, finished_at). Admin read only.
- `box_heartbeats` (run_id, phase, started_at, finished_at, streams, counts, warnings,
  request_id, received_at), unique on (run_id, phase). Admin read only.
- `ingest_rate_counters` (key_label, window_start, hits): per-minute call counter for the
  120 calls a minute limit. No client access at all.
- `daily_cycle_runs` (one row per run-daily-cycle call). Admin read only.
- `alert_events` (farm_id, rule_id, as_of, triggered, value, threshold, dedupe_key unique,
  message_id): one evaluation per rule per date, so repeat runs change nothing.
  Farm members read their own farm's rows. Audited.

2. Modified tables
- `sources`: origin (synthetic|box), owner, url, licence_scope (general|single_client),
  attribution_text, refresh_cadence, merchant_interest_note, box_licence_class,
  box_licence_scope (the box's ceiling), admin_licence_class, admin_licence_scope
  (admin restrictions), updated_at. A trigger works out the effective licence_class and
  licence_scope from the ceiling plus any restriction and refuses any loosening.
- `market_series`: commodity may now be 'other' (contract commodities such as red_diesel
  are kept in commodity_code); new basis, region, delivery_period, frequency,
  commodity_code, updated_at.
- `market_observations`: value_exact (full precision, e.g. 0.8353), provenance (file,
  sha256, captured_at), ingest_request_id, updated_at.
- `briefs`: origin, edition, released_at, word_count, run_id, watchlist, warnings,
  pdf_path, pdf_sha256, pdf_bytes, updated_at.
- `messages`: origin (seed|daily_cycle), alert_event_id.

3. Security
- RLS on every new table; admin-only SELECT where relevant; no client write policies
  (all writes go through the functions using the service role or checked functions).
- Observations of single_client sources are hidden from everyone until per-farm
  permissions arrive (stage B3).
- Platform-level audit rows (no farm) become readable by app admins.
- New private storage bucket `brief-pdfs` (PDF only, 10 MB), readable by signed-in users.

4. Notes
1. Nothing is dropped or renamed; existing synthetic rows keep working (origin 'synthetic').
2. The commodity CHECK is replaced with a wider one; no data changes.
*/

CREATE TABLE IF NOT EXISTS app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_admins_select_own ON app_admins;
CREATE POLICY app_admins_select_own ON app_admins FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION is_app_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = auth.uid()); $$;
REVOKE ALL ON FUNCTION is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_app_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS box_link_settings (
  id int PRIMARY KEY CHECK (id = 1),
  accept_data boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO box_link_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE box_link_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS box_link_settings_select_admin ON box_link_settings;
CREATE POLICY box_link_settings_select_admin ON box_link_settings FOR SELECT TO authenticated USING (is_app_admin());

CREATE TABLE IF NOT EXISTS ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  endpoint text NOT NULL,
  run_id text,
  source_code text,
  http_status int NOT NULL,
  ok boolean NOT NULL,
  error_code text,
  detail text,
  received int NOT NULL DEFAULT 0,
  inserted int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  rejected jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  caller_ip text,
  key_label text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ingest_runs_endpoint_time_idx ON ingest_runs (endpoint, started_at DESC);
ALTER TABLE ingest_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ingest_runs_select_admin ON ingest_runs;
CREATE POLICY ingest_runs_select_admin ON ingest_runs FOR SELECT TO authenticated USING (is_app_admin());

CREATE TABLE IF NOT EXISTS box_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('started', 'finished')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  streams jsonb NOT NULL DEFAULT '{}'::jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_id uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, phase)
);
CREATE INDEX IF NOT EXISTS box_heartbeats_received_idx ON box_heartbeats (received_at DESC);
ALTER TABLE box_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS box_heartbeats_select_admin ON box_heartbeats;
CREATE POLICY box_heartbeats_select_admin ON box_heartbeats FOR SELECT TO authenticated USING (is_app_admin());

CREATE TABLE IF NOT EXISTS ingest_rate_counters (
  key_label text NOT NULL,
  window_start timestamptz NOT NULL,
  hits int NOT NULL DEFAULT 0,
  PRIMARY KEY (key_label, window_start)
);
ALTER TABLE ingest_rate_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS daily_cycle_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  as_of date NOT NULL,
  run_id text,
  triggered_by text NOT NULL CHECK (triggered_by IN ('cron', 'admin')),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  farms int NOT NULL DEFAULT 0,
  rules_evaluated int NOT NULL DEFAULT 0,
  events_created int NOT NULL DEFAULT 0,
  messages_created int NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ok boolean NOT NULL,
  detail text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE daily_cycle_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_cycle_runs_select_admin ON daily_cycle_runs;
CREATE POLICY daily_cycle_runs_select_admin ON daily_cycle_runs FOR SELECT TO authenticated USING (is_app_admin());

CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  as_of date NOT NULL,
  triggered boolean NOT NULL,
  value numeric,
  threshold numeric NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_events_farm_idx ON alert_events (farm_id, as_of DESC);
CREATE INDEX IF NOT EXISTS alert_events_rule_idx ON alert_events (rule_id);
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_events_select ON alert_events;
CREATE POLICY alert_events_select ON alert_events FOR SELECT TO authenticated USING (is_farm_member(farm_id));
DROP TRIGGER IF EXISTS alert_events_audit ON alert_events;
CREATE TRIGGER alert_events_audit AFTER INSERT OR UPDATE OR DELETE ON alert_events FOR EACH ROW EXECUTE FUNCTION write_audit();

ALTER TABLE sources ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'synthetic';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT '';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS licence_scope text NOT NULL DEFAULT 'general';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS attribution_text text NOT NULL DEFAULT '';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS refresh_cadence text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS merchant_interest_note text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS box_licence_class text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS box_licence_scope text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS admin_licence_class text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS admin_licence_scope text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_origin_check;
ALTER TABLE sources ADD CONSTRAINT sources_origin_check CHECK (origin IN ('synthetic', 'box'));
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_licence_scope_check;
ALTER TABLE sources ADD CONSTRAINT sources_licence_scope_check CHECK (licence_scope IN ('general', 'single_client'));
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_box_licence_class_check;
ALTER TABLE sources ADD CONSTRAINT sources_box_licence_class_check CHECK (box_licence_class IS NULL OR box_licence_class IN ('display', 'chart'));
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_box_licence_scope_check;
ALTER TABLE sources ADD CONSTRAINT sources_box_licence_scope_check CHECK (box_licence_scope IS NULL OR box_licence_scope IN ('general', 'single_client'));
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_admin_licence_class_check;
ALTER TABLE sources ADD CONSTRAINT sources_admin_licence_class_check CHECK (admin_licence_class IS NULL OR admin_licence_class = 'display');
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_admin_licence_scope_check;
ALTER TABLE sources ADD CONSTRAINT sources_admin_licence_scope_check CHECK (admin_licence_scope IS NULL OR admin_licence_scope = 'single_client');
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_box_ceiling_present;
ALTER TABLE sources ADD CONSTRAINT sources_box_ceiling_present CHECK (origin <> 'box' OR (box_licence_class IS NOT NULL AND box_licence_scope IS NOT NULL));

CREATE OR REPLACE FUNCTION sources_apply_licence_ceiling() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_class text;
  v_scope text;
BEGIN
  IF NEW.origin <> 'box' THEN
    RETURN NEW;
  END IF;
  IF NEW.admin_licence_class IS NOT NULL AND NEW.box_licence_class <> 'chart' THEN
    IF TG_OP = 'UPDATE' AND NEW.admin_licence_class IS DISTINCT FROM OLD.admin_licence_class THEN
      RAISE EXCEPTION 'Licence class cannot be loosened beyond the box''s ceiling (%).', NEW.box_licence_class USING ERRCODE = 'P0422';
    END IF;
    NEW.admin_licence_class := NULL;
  END IF;
  IF NEW.admin_licence_scope IS NOT NULL AND NEW.box_licence_scope = 'single_client' THEN
    NEW.admin_licence_scope := NULL;
  END IF;
  v_class := COALESCE(NEW.admin_licence_class, NEW.box_licence_class);
  v_scope := CASE WHEN NEW.box_licence_scope = 'single_client' OR NEW.admin_licence_scope = 'single_client'
                  THEN 'single_client' ELSE 'general' END;
  IF TG_OP = 'UPDATE' AND NEW.licence_class IS DISTINCT FROM OLD.licence_class AND NEW.licence_class <> v_class THEN
    RAISE EXCEPTION 'Licence class cannot be loosened beyond the box''s ceiling (%).', NEW.box_licence_class USING ERRCODE = 'P0422';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.licence_scope IS DISTINCT FROM OLD.licence_scope AND NEW.licence_scope <> v_scope THEN
    RAISE EXCEPTION 'Licence scope cannot be loosened beyond the box''s ceiling (%).', NEW.box_licence_scope USING ERRCODE = 'P0422';
  END IF;
  NEW.licence_class := v_class;
  NEW.licence_scope := v_scope;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sources_licence_ceiling ON sources;
CREATE TRIGGER sources_licence_ceiling BEFORE INSERT OR UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION sources_apply_licence_ceiling();
DROP TRIGGER IF EXISTS sources_audit ON sources;
CREATE TRIGGER sources_audit AFTER INSERT OR UPDATE OR DELETE ON sources FOR EACH ROW EXECUTE FUNCTION write_audit();

ALTER TABLE market_series DROP CONSTRAINT IF EXISTS market_series_commodity_check;
ALTER TABLE market_series ADD CONSTRAINT market_series_commodity_check CHECK (commodity IN ('grain', 'fertiliser', 'fuel', 'other'));
ALTER TABLE market_series ADD COLUMN IF NOT EXISTS commodity_code text;
ALTER TABLE market_series ADD COLUMN IF NOT EXISTS basis text;
ALTER TABLE market_series ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE market_series ADD COLUMN IF NOT EXISTS delivery_period text;
ALTER TABLE market_series ADD COLUMN IF NOT EXISTS frequency text;
ALTER TABLE market_series ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS market_series_audit ON market_series;
CREATE TRIGGER market_series_audit AFTER INSERT OR UPDATE OR DELETE ON market_series FOR EACH ROW EXECUTE FUNCTION write_audit();

ALTER TABLE market_observations ADD COLUMN IF NOT EXISTS value_exact numeric;
ALTER TABLE market_observations ADD COLUMN IF NOT EXISTS provenance jsonb;
ALTER TABLE market_observations ADD COLUMN IF NOT EXISTS ingest_request_id uuid;
ALTER TABLE market_observations ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DROP POLICY IF EXISTS market_observations_select_licensed ON market_observations;
CREATE POLICY market_observations_select_licensed ON market_observations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM market_series s JOIN sources src ON src.id = s.source_id
  WHERE s.id = market_observations.series_id
    AND src.status = 'active'
    AND src.licence_class IN ('display', 'chart')
    AND src.licence_scope = 'general'
));

ALTER TABLE briefs ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'synthetic';
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS edition text NOT NULL DEFAULT 'weekday_short';
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS word_count int;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS run_id text;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS watchlist jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS pdf_path text;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS pdf_sha256 text;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS pdf_bytes int;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_origin_check;
ALTER TABLE briefs ADD CONSTRAINT briefs_origin_check CHECK (origin IN ('synthetic', 'box'));
ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_edition_check;
ALTER TABLE briefs ADD CONSTRAINT briefs_edition_check CHECK (edition IN ('weekday_short', 'friday_full'));

ALTER TABLE messages ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'seed';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS alert_event_id uuid;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_origin_check;
ALTER TABLE messages ADD CONSTRAINT messages_origin_check CHECK (origin IN ('seed', 'daily_cycle'));

DROP POLICY IF EXISTS audit_log_select_platform_admin ON audit_log;
CREATE POLICY audit_log_select_platform_admin ON audit_log FOR SELECT TO authenticated USING (farm_id IS NULL AND is_app_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('brief-pdfs', 'brief-pdfs', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS brief_pdfs_select ON storage.objects;
CREATE POLICY brief_pdfs_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'brief-pdfs');
