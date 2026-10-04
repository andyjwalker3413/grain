/*
# Box link: database functions

Plain English: the checked steps the box functions and the Admin > Box link page use.
Every write is an upsert on the contract's natural key and only touches a row when
something actually changed, so the same payload sent twice changes nothing.

1. Box-only functions (callable by the server key only, never by browsers)
- `box_rate_hit(label)`: counts a call in the current minute and returns the count.
- `box_sync_catalogue(sources, series)`: upserts sources and series by code. Refuses
  codes already used by demo data and series naming an unknown source (error P0422).
- `box_ingest_observations(source, rows, request)`: upserts observations by
  (series, date) with provenance. Refuses unknown source or series codes (P0422).
- `box_upsert_brief(payload)`: upserts one brief by date. Refuses unknown source codes
  or chart references (P0422). Keeps an earlier PDF when a repeat arrives without one.
- `box_record_heartbeat(payload, request)`: stores a heartbeat by (run_id, phase).

2. Admin functions (signed-in app admins only; everyone else gets "not allowed")
- `set_box_link_accepting(accept)`: the "Accept data from the box" switch.
- `admin_restrict_source(code, licence_class, licence_scope, status)`: restricts a box
  source. Any attempt to loosen beyond the box's ceiling is refused (P0422).
- `box_link_health()`: everything the health page shows, in one call.

3. Security
- All functions run with a fixed empty search path.
- Box-only functions: EXECUTE revoked from PUBLIC, anon and authenticated.
- Admin functions check `is_app_admin()` before doing anything.
- The switch row is audited.
*/

CREATE OR REPLACE FUNCTION box_rate_hit(p_label text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_hits int;
BEGIN
  INSERT INTO public.ingest_rate_counters AS c (key_label, window_start, hits)
  VALUES (p_label, date_trunc('minute', now()), 1)
  ON CONFLICT (key_label, window_start) DO UPDATE SET hits = c.hits + 1
  RETURNING c.hits INTO v_hits;
  DELETE FROM public.ingest_rate_counters WHERE window_start < now() - interval '1 hour';
  RETURN v_hits;
END $$;

CREATE OR REPLACE FUNCTION box_sync_catalogue(p_sources jsonb, p_series jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_codes text[];
  v_src_ins int; v_src_upd int; v_ser_ins int; v_ser_upd int;
BEGIN
  SELECT array_agg(s.id ORDER BY s.id) INTO v_codes FROM public.sources s
  WHERE s.origin <> 'box' AND s.id IN (SELECT x->>'code' FROM jsonb_array_elements(p_sources) x);
  IF v_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Source codes reserved for demo data: %', array_to_string(v_codes, ', ') USING ERRCODE = 'P0422';
  END IF;

  SELECT array_agg(ms.id ORDER BY ms.id) INTO v_codes FROM public.market_series ms
  JOIN public.sources s ON s.id = ms.source_id
  WHERE s.origin <> 'box' AND ms.id IN (SELECT x->>'code' FROM jsonb_array_elements(p_series) x);
  IF v_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Series codes reserved for demo data: %', array_to_string(v_codes, ', ') USING ERRCODE = 'P0422';
  END IF;

  SELECT array_agg(DISTINCT x->>'source_code') INTO v_codes FROM jsonb_array_elements(p_series) x
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_sources) y WHERE y->>'code' = x->>'source_code')
    AND NOT EXISTS (SELECT 1 FROM public.sources s WHERE s.id = x->>'source_code' AND s.origin = 'box');
  IF v_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown source codes: %', array_to_string(v_codes, ', ') USING ERRCODE = 'P0422';
  END IF;

  WITH up AS (
    INSERT INTO public.sources AS s (id, name, owner, url, licence_class, licence_scope, box_licence_class,
      box_licence_scope, attribution_text, independence, merchant_interest_note, refresh_cadence,
      origin, is_synthetic, status, notes)
    SELECT x->>'code', x->>'name', x->>'owner', x->>'url', x->>'licence_class', x->>'licence_scope',
      x->>'licence_class', x->>'licence_scope', x->>'attribution_text', x->>'independence',
      x->>'merchant_interest_note', x->>'refresh_cadence', 'box', false, 'active', ''
    FROM jsonb_array_elements(p_sources) x
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, owner = EXCLUDED.owner, url = EXCLUDED.url,
      box_licence_class = EXCLUDED.box_licence_class, box_licence_scope = EXCLUDED.box_licence_scope,
      attribution_text = EXCLUDED.attribution_text, independence = EXCLUDED.independence,
      merchant_interest_note = EXCLUDED.merchant_interest_note, refresh_cadence = EXCLUDED.refresh_cadence,
      updated_at = now()
    WHERE (s.name, s.owner, s.url, s.box_licence_class, s.box_licence_scope, s.attribution_text,
           s.independence, s.merchant_interest_note, s.refresh_cadence)
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.owner, EXCLUDED.url, EXCLUDED.box_licence_class,
           EXCLUDED.box_licence_scope, EXCLUDED.attribution_text, EXCLUDED.independence,
           EXCLUDED.merchant_interest_note, EXCLUDED.refresh_cadence)
    RETURNING (xmax = 0) AS ins
  )
  SELECT count(*) FILTER (WHERE ins), count(*) FILTER (WHERE NOT ins) INTO v_src_ins, v_src_upd FROM up;

  WITH up AS (
    INSERT INTO public.market_series AS m (id, source_id, commodity, commodity_code, name, unit, basis,
      region, delivery_period, frequency, sort_order)
    SELECT x->>'code', x->>'source_code', x->>'group', x->>'commodity', x->>'name', x->>'unit',
      x->>'basis', x->>'region', x->>'delivery_period', x->>'frequency', 1000
    FROM jsonb_array_elements(p_series) x
    ON CONFLICT (id) DO UPDATE SET
      source_id = EXCLUDED.source_id, commodity = EXCLUDED.commodity, commodity_code = EXCLUDED.commodity_code,
      name = EXCLUDED.name, unit = EXCLUDED.unit, basis = EXCLUDED.basis, region = EXCLUDED.region,
      delivery_period = EXCLUDED.delivery_period, frequency = EXCLUDED.frequency, updated_at = now()
    WHERE (m.source_id, m.commodity, m.commodity_code, m.name, m.unit, m.basis, m.region,
           m.delivery_period, m.frequency)
      IS DISTINCT FROM (EXCLUDED.source_id, EXCLUDED.commodity, EXCLUDED.commodity_code, EXCLUDED.name,
           EXCLUDED.unit, EXCLUDED.basis, EXCLUDED.region, EXCLUDED.delivery_period, EXCLUDED.frequency)
    RETURNING (xmax = 0) AS ins
  )
  SELECT count(*) FILTER (WHERE ins), count(*) FILTER (WHERE NOT ins) INTO v_ser_ins, v_ser_upd FROM up;

  RETURN jsonb_build_object('inserted', v_src_ins + v_ser_ins, 'updated', v_src_upd + v_ser_upd);
END $$;

CREATE OR REPLACE FUNCTION box_ingest_observations(p_source text, p_rows jsonb, p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_codes text[];
  v_ins int; v_upd int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sources s WHERE s.id = p_source AND s.origin = 'box') THEN
    RAISE EXCEPTION 'Unknown source code: %', p_source USING ERRCODE = 'P0422';
  END IF;

  SELECT array_agg(DISTINCT x->>'series_code') INTO v_codes FROM jsonb_array_elements(p_rows) x
  WHERE NOT EXISTS (SELECT 1 FROM public.market_series ms WHERE ms.id = x->>'series_code' AND ms.source_id = p_source);
  IF v_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown series codes for source %: %', p_source, array_to_string(v_codes, ', ') USING ERRCODE = 'P0422';
  END IF;

  WITH up AS (
    INSERT INTO public.market_observations AS o (series_id, observed_on, value, value_exact, provenance, ingest_request_id, updated_at)
    SELECT x->>'series_code', (x->>'date')::date, (x->>'value')::numeric, (x->>'value')::numeric,
      x->'provenance', p_request, now()
    FROM jsonb_array_elements(p_rows) x
    ON CONFLICT (series_id, observed_on) DO UPDATE SET
      value = EXCLUDED.value, value_exact = EXCLUDED.value_exact, provenance = EXCLUDED.provenance,
      ingest_request_id = EXCLUDED.ingest_request_id, updated_at = now()
    WHERE (o.value_exact, o.provenance) IS DISTINCT FROM (EXCLUDED.value_exact, EXCLUDED.provenance)
    RETURNING (xmax = 0) AS ins
  )
  SELECT count(*) FILTER (WHERE ins), count(*) FILTER (WHERE NOT ins) INTO v_ins, v_upd FROM up;

  RETURN jsonb_build_object('inserted', v_ins, 'updated', v_upd);
END $$;

CREATE OR REPLACE FUNCTION box_upsert_brief(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_codes text[];
  v_ins int; v_upd int;
BEGIN
  SELECT array_agg(DISTINCT c ORDER BY c) INTO v_codes
  FROM jsonb_array_elements(p->'sections') sec, jsonb_array_elements_text(sec->'source_codes') c
  WHERE NOT EXISTS (SELECT 1 FROM public.sources s WHERE s.id = c AND s.origin = 'box');
  IF v_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown source codes in brief sections: %', array_to_string(v_codes, ', ') USING ERRCODE = 'P0422';
  END IF;

  SELECT array_agg(DISTINCT c ORDER BY c) INTO v_codes
  FROM jsonb_array_elements(p->'sections') sec, jsonb_array_elements_text(sec->'chart_refs') c
  WHERE NOT EXISTS (SELECT 1 FROM public.market_series ms JOIN public.sources s ON s.id = ms.source_id
                    WHERE ms.id = c AND s.origin = 'box');
  IF v_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown series codes in brief chart_refs: %', array_to_string(v_codes, ', ') USING ERRCODE = 'P0422';
  END IF;

  WITH up AS (
    INSERT INTO public.briefs AS b (brief_date, title, summary, sections, is_synthetic, origin, edition,
      released_at, word_count, run_id, watchlist, warnings, pdf_path, pdf_sha256, pdf_bytes, updated_at)
    VALUES ((p->>'date')::date, p->>'title', '', p->'sections', false, 'box', p->>'edition',
      (p->>'released_at')::timestamptz, (p->>'word_count')::int, p->>'run_id', p->'watchlist',
      COALESCE(p->'warnings', '[]'::jsonb), p->>'pdf_path', p->>'pdf_sha256', (p->>'pdf_bytes')::int, now())
    ON CONFLICT (brief_date) DO UPDATE SET
      title = EXCLUDED.title, summary = '', sections = EXCLUDED.sections, is_synthetic = false, origin = 'box',
      edition = EXCLUDED.edition, released_at = EXCLUDED.released_at, word_count = EXCLUDED.word_count,
      run_id = EXCLUDED.run_id, watchlist = EXCLUDED.watchlist, warnings = EXCLUDED.warnings,
      pdf_path = COALESCE(EXCLUDED.pdf_path, b.pdf_path), pdf_sha256 = COALESCE(EXCLUDED.pdf_sha256, b.pdf_sha256),
      pdf_bytes = COALESCE(EXCLUDED.pdf_bytes, b.pdf_bytes), updated_at = now()
    WHERE (b.title, b.sections, b.origin, b.edition, b.released_at, b.word_count, b.watchlist, b.pdf_sha256)
      IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.sections, 'box', EXCLUDED.edition, EXCLUDED.released_at,
           EXCLUDED.word_count, EXCLUDED.watchlist, COALESCE(EXCLUDED.pdf_sha256, b.pdf_sha256))
    RETURNING (xmax = 0) AS ins
  )
  SELECT count(*) FILTER (WHERE ins), count(*) FILTER (WHERE NOT ins) INTO v_ins, v_upd FROM up;

  RETURN jsonb_build_object('inserted', v_ins, 'updated', v_upd);
END $$;

CREATE OR REPLACE FUNCTION box_record_heartbeat(p jsonb, p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ins int; v_upd int;
BEGIN
  WITH up AS (
    INSERT INTO public.box_heartbeats AS h (run_id, phase, started_at, finished_at, streams, counts, warnings, request_id)
    VALUES (p->>'run_id', p->>'phase', (p->>'started_at')::timestamptz, (p->>'finished_at')::timestamptz,
      COALESCE(p->'streams', '{}'::jsonb), COALESCE(p->'counts', '{}'::jsonb), COALESCE(p->'warnings', '[]'::jsonb), p_request)
    ON CONFLICT (run_id, phase) DO UPDATE SET
      started_at = EXCLUDED.started_at, finished_at = EXCLUDED.finished_at, streams = EXCLUDED.streams,
      counts = EXCLUDED.counts, warnings = EXCLUDED.warnings, request_id = EXCLUDED.request_id, received_at = now()
    WHERE (h.started_at, h.finished_at, h.streams, h.counts, h.warnings)
      IS DISTINCT FROM (EXCLUDED.started_at, EXCLUDED.finished_at, EXCLUDED.streams, EXCLUDED.counts, EXCLUDED.warnings)
    RETURNING (xmax = 0) AS ins
  )
  SELECT count(*) FILTER (WHERE ins), count(*) FILTER (WHERE NOT ins) INTO v_ins, v_upd FROM up;
  RETURN jsonb_build_object('inserted', v_ins, 'updated', v_upd);
END $$;

REVOKE ALL ON FUNCTION box_rate_hit(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION box_sync_catalogue(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION box_ingest_observations(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION box_upsert_brief(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION box_record_heartbeat(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION box_rate_hit(text) TO service_role;
GRANT EXECUTE ON FUNCTION box_sync_catalogue(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION box_ingest_observations(text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION box_upsert_brief(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION box_record_heartbeat(jsonb, uuid) TO service_role;

DROP TRIGGER IF EXISTS box_link_settings_audit ON box_link_settings;
CREATE TRIGGER box_link_settings_audit AFTER INSERT OR UPDATE OR DELETE ON box_link_settings FOR EACH ROW EXECUTE FUNCTION write_audit();

CREATE OR REPLACE FUNCTION set_box_link_accepting(p_accept boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.box_link_settings SET accept_data = p_accept, updated_by = auth.uid(), updated_at = now() WHERE id = 1;
  RETURN p_accept;
END $$;

CREATE OR REPLACE FUNCTION admin_restrict_source(p_code text, p_licence_class text, p_licence_scope text, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_src public.sources%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_src FROM public.sources WHERE id = p_code AND origin = 'box';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown box source: %', p_code USING ERRCODE = 'P0422';
  END IF;
  IF p_licence_class NOT IN ('display', 'chart') OR p_licence_scope NOT IN ('general', 'single_client')
     OR p_status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'Invalid licence or status value' USING ERRCODE = 'P0422';
  END IF;
  IF p_licence_class = 'chart' AND v_src.box_licence_class = 'display' THEN
    RAISE EXCEPTION 'The box allows % only for %; it cannot be loosened to chart.', v_src.box_licence_class, p_code USING ERRCODE = 'P0422';
  END IF;
  IF p_licence_scope = 'general' AND v_src.box_licence_scope = 'single_client' THEN
    RAISE EXCEPTION 'The box limits % to single_client; it cannot be widened to general.', p_code USING ERRCODE = 'P0422';
  END IF;
  UPDATE public.sources SET
    admin_licence_class = CASE WHEN p_licence_class = 'display' AND v_src.box_licence_class = 'chart' THEN 'display' END,
    admin_licence_scope = CASE WHEN p_licence_scope = 'single_client' AND v_src.box_licence_scope = 'general' THEN 'single_client' END,
    status = p_status,
    updated_at = now()
  WHERE id = p_code;
END $$;

CREATE OR REPLACE FUNCTION box_link_health() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'settings', (SELECT to_jsonb(s) - 'id' FROM public.box_link_settings s WHERE s.id = 1),
    'heartbeats', COALESCE((SELECT jsonb_agg(to_jsonb(h) - 'id' ORDER BY h.received_at DESC)
       FROM (SELECT * FROM public.box_heartbeats ORDER BY received_at DESC LIMIT 10) h), '[]'::jsonb),
    'last_success', COALESCE((SELECT jsonb_object_agg(endpoint, finished_at) FROM (
       SELECT endpoint, max(finished_at) AS finished_at FROM public.ingest_runs WHERE ok GROUP BY endpoint) x), '{}'::jsonb),
    'last_cycle', (SELECT to_jsonb(c) - 'id' FROM public.daily_cycle_runs c ORDER BY c.started_at DESC LIMIT 1),
    'recent_runs', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'id' ORDER BY r.started_at DESC)
       FROM (SELECT * FROM public.ingest_runs ORDER BY started_at DESC LIMIT 25) r), '[]'::jsonb),
    'warnings', COALESCE((SELECT jsonb_agg(jsonb_build_object('endpoint', r.endpoint, 'at', r.started_at, 'warnings', r.warnings) ORDER BY r.started_at DESC)
       FROM (SELECT * FROM public.ingest_runs WHERE jsonb_array_length(warnings) > 0 ORDER BY started_at DESC LIMIT 20) r), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'code', s.id, 'name', s.name, 'status', s.status, 'licence_class', s.licence_class,
         'licence_scope', s.licence_scope, 'box_licence_class', s.box_licence_class,
         'box_licence_scope', s.box_licence_scope, 'refresh_cadence', s.refresh_cadence,
         'updated_at', s.updated_at) ORDER BY s.id)
       FROM public.sources s WHERE s.origin = 'box'), '[]'::jsonb),
    'series', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'code', ms.id, 'name', ms.name, 'source_code', ms.source_id, 'unit', ms.unit,
         'frequency', ms.frequency, 'refresh_cadence', s.refresh_cadence,
         'last_observed_on', (SELECT max(o.observed_on) FROM public.market_observations o WHERE o.series_id = ms.id),
         'observations', (SELECT count(*) FROM public.market_observations o WHERE o.series_id = ms.id)) ORDER BY ms.id)
       FROM public.market_series ms JOIN public.sources s ON s.id = ms.source_id WHERE s.origin = 'box'), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION set_box_link_accepting(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_restrict_source(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION box_link_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_box_link_accepting(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_restrict_source(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION box_link_health() TO authenticated;
