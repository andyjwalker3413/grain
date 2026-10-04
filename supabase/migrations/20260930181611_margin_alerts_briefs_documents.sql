/*
# Margin costs, alerts, desk messages, briefs and documents

Plain English: adds per-hectare cost lines for each crop (some fixed, some linked
to a market price like fertiliser), alert rules a farm sets on its own numbers,
messages sent by the desk, the daily market brief, and uploaded documents.

1. New tables
- cost_lines (FS): farm_id, crop_id, name, category, amount_p_per_ha (fixed cost) OR
  qty_per_ha + series_id (cost linked to a market price, e.g. t/ha of fertiliser)
- alert_rules (FS): farm_id, crop_id (optional), metric (reference_price|margin_per_ha|committed_pct),
  direction (above|below), threshold, active
- messages: farm_id, kind, title, body, status, created_at. Members read delivered messages
  for their farm; no one writes from the app.
- briefs: brief_date, title, summary, sections (jsonb), is_synthetic. Readable by any signed-in user; no app writes.
- documents (FS): farm_id, file_path, file_name, doc_type, size_bytes, status (uploaded|checking|checked|failed)

2. Storage
- Private bucket farm-documents; files must live under <farm_id>/...; members read;
  owners/members upload and delete. 10 MB limit, PDF/images only.

3. Security
- RLS on every table; FS tables use the farm helpers and audit trigger.
- Composite keys keep crop links within the same farm.

4. Demo data
- seed_demo_extras(farm) adds Downland cost lines (winter wheat totals £1,353.90/ha,
  worked example B), two alert rules and three desk messages. Existing demo farms back-filled.
- Seven synthetic daily briefs.
*/

CREATE TABLE IF NOT EXISTS cost_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  crop_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  category text NOT NULL CHECK (category IN ('fertiliser','fuel','seed','sprays','machinery','overheads','other')),
  amount_p_per_ha integer CHECK (amount_p_per_ha >= 0),
  qty_per_ha numeric(10,4) CHECK (qty_per_ha >= 0),
  series_id text REFERENCES market_series(id),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (farm_id, crop_id) REFERENCES crops(farm_id, id) ON DELETE CASCADE,
  CHECK ((amount_p_per_ha IS NOT NULL AND qty_per_ha IS NULL AND series_id IS NULL)
      OR (amount_p_per_ha IS NULL AND qty_per_ha IS NOT NULL AND series_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cost_lines_crop_idx ON cost_lines(farm_id, crop_id);
CREATE INDEX IF NOT EXISTS cost_lines_series_idx ON cost_lines(series_id);

CREATE TABLE IF NOT EXISTS alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  crop_id uuid NOT NULL,
  metric text NOT NULL CHECK (metric IN ('reference_price','margin_per_ha','committed_pct')),
  direction text NOT NULL CHECK (direction IN ('above','below')),
  threshold numeric(12,2) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (farm_id, crop_id) REFERENCES crops(farm_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS alert_rules_farm_idx ON alert_rules(farm_id);
CREATE INDEX IF NOT EXISTS alert_rules_crop_idx ON alert_rules(farm_id, crop_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('alert','market_note','weekly_summary')),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','approved','delivered','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_farm_idx ON messages(farm_id, created_at DESC);

CREATE TABLE IF NOT EXISTS briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_date date NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  doc_type text NOT NULL DEFAULT 'contract' CHECK (doc_type IN ('contract','quote','settlement','other')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','checking','checked','failed')),
  uploaded_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (split_part(file_path, '/', 1) = farm_id::text)
);
CREATE INDEX IF NOT EXISTS documents_farm_idx ON documents(farm_id, created_at DESC);

ALTER TABLE cost_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cost_lines','alert_rules','documents'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select" ON %1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_select" ON %1$I FOR SELECT TO authenticated USING (public.is_farm_member(farm_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert" ON %1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_insert" ON %1$I FOR INSERT TO authenticated WITH CHECK (public.can_edit_farm(farm_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update" ON %1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_update" ON %1$I FOR UPDATE TO authenticated USING (public.can_edit_farm(farm_id)) WITH CHECK (public.can_edit_farm(farm_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete" ON %1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_delete" ON %1$I FOR DELETE TO authenticated USING (public.can_edit_farm(farm_id))', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_audit ON %1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_audit AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION public.write_audit()', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "messages_select_delivered" ON messages;
CREATE POLICY "messages_select_delivered" ON messages FOR SELECT TO authenticated
  USING (status = 'delivered' AND public.is_farm_member(farm_id));

DROP POLICY IF EXISTS "briefs_select" ON briefs;
CREATE POLICY "briefs_select" ON briefs FOR SELECT TO authenticated USING (true);

-- Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('farm-documents', 'farm-documents', false, 10485760, ARRAY['application/pdf','image/png','image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.storage_farm_id(p_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RETURN split_part(p_name, '/', 1)::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

DROP POLICY IF EXISTS "farm_documents_select" ON storage.objects;
CREATE POLICY "farm_documents_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'farm-documents' AND public.is_farm_member(public.storage_farm_id(name)));
DROP POLICY IF EXISTS "farm_documents_insert" ON storage.objects;
CREATE POLICY "farm_documents_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'farm-documents' AND public.can_edit_farm(public.storage_farm_id(name)));
DROP POLICY IF EXISTS "farm_documents_delete" ON storage.objects;
CREATE POLICY "farm_documents_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'farm-documents' AND public.can_edit_farm(public.storage_farm_id(name)));

-- Demo seed
CREATE OR REPLACE FUNCTION public.seed_demo_extras(p_farm uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_wheat uuid; v_barley uuid; v_osr uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.farms f WHERE f.id = p_farm AND f.is_demo) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.cost_lines c WHERE c.farm_id = p_farm) THEN RETURN; END IF;
  SELECT id INTO v_wheat FROM public.crops WHERE farm_id = p_farm AND name = 'Winter wheat' LIMIT 1;
  SELECT id INTO v_barley FROM public.crops WHERE farm_id = p_farm AND name = 'Feed barley' LIMIT 1;
  SELECT id INTO v_osr FROM public.crops WHERE farm_id = p_farm AND name = 'Oilseed rape' LIMIT 1;
  IF v_wheat IS NULL OR v_barley IS NULL OR v_osr IS NULL THEN RETURN; END IF;

  INSERT INTO public.cost_lines(farm_id, crop_id, name, category, amount_p_per_ha, qty_per_ha, series_id, sort_order) VALUES
    (p_farm, v_wheat, 'Ammonium nitrate', 'fertiliser', NULL, 0.6, 'ammonium-nitrate', 1),
    (p_farm, v_wheat, 'Fuel', 'fuel', 7790, NULL, NULL, 2),
    (p_farm, v_wheat, 'Seed', 'seed', 8500, NULL, NULL, 3),
    (p_farm, v_wheat, 'Sprays', 'sprays', 21000, NULL, NULL, 4),
    (p_farm, v_wheat, 'Machinery and contractors', 'machinery', 31000, NULL, NULL, 5),
    (p_farm, v_wheat, 'Rent and overheads', 'overheads', 46700, NULL, NULL, 6),
    (p_farm, v_barley, 'Ammonium nitrate', 'fertiliser', NULL, 0.45, 'ammonium-nitrate', 1),
    (p_farm, v_barley, 'Fuel', 'fuel', 7200, NULL, NULL, 2),
    (p_farm, v_barley, 'Seed', 'seed', 7000, NULL, NULL, 3),
    (p_farm, v_barley, 'Sprays', 'sprays', 15500, NULL, NULL, 4),
    (p_farm, v_barley, 'Machinery and contractors', 'machinery', 28000, NULL, NULL, 5),
    (p_farm, v_barley, 'Rent and overheads', 'overheads', 46700, NULL, NULL, 6),
    (p_farm, v_osr, 'Granular urea', 'fertiliser', NULL, 0.35, 'urea', 1),
    (p_farm, v_osr, 'Fuel', 'fuel', 6800, NULL, NULL, 2),
    (p_farm, v_osr, 'Seed', 'seed', 6500, NULL, NULL, 3),
    (p_farm, v_osr, 'Sprays', 'sprays', 19500, NULL, NULL, 4),
    (p_farm, v_osr, 'Machinery and contractors', 'machinery', 27000, NULL, NULL, 5),
    (p_farm, v_osr, 'Rent and overheads', 'overheads', 46700, NULL, NULL, 6);

  INSERT INTO public.alert_rules(farm_id, crop_id, metric, direction, threshold, created_by) VALUES
    (p_farm, v_wheat, 'reference_price', 'above', 175, NULL),
    (p_farm, v_barley, 'margin_per_ha', 'below', 0, NULL);

  INSERT INTO public.messages(farm_id, kind, title, body, status, created_at) VALUES
    (p_farm, 'weekly_summary', 'Your week in grain', 'Feed wheat ex-farm rose £4.50/t on the week in the synthetic index. On your 420 t unsold and 100 t minimum-price wheat, that is worth +£2,340.00 to Downland Farm. Test data only.', 'delivered', now() - interval '1 day'),
    (p_farm, 'alert', 'Feed wheat above your £175/t alert', 'The feed wheat reference is £176.50/t, above the £175.00/t level you set for winter wheat. Test data only.', 'delivered', now() - interval '2 days'),
    (p_farm, 'market_note', 'Fertiliser prices easing', 'Ammonium nitrate in the synthetic survey is £340/t this week. It feeds straight into your wheat and barley margins on the Margin page. Test data only.', 'delivered', now() - interval '5 days');
END $$;
REVOKE ALL ON FUNCTION public.seed_demo_extras(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_demo_farm()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT f.id INTO v_id FROM public.farms f WHERE f.created_by = auth.uid() AND f.is_demo LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.farms(name, county, total_ha, finance_rate, is_demo, created_by)
    VALUES ('Downland Farm', 'Hampshire', 420, 0.06, true, auth.uid())
    RETURNING id INTO v_id;
  END IF;
  PERFORM public.seed_demo_position(v_id);
  PERFORM public.seed_demo_extras(v_id);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_demo_farm() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_demo_farm() TO authenticated;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT id FROM public.farms WHERE is_demo LOOP
    PERFORM public.seed_demo_extras(f.id);
  END LOOP;
END $$;

INSERT INTO briefs(brief_date, title, summary, sections) VALUES
  ('2026-09-30', 'Wheat firms as export demand steadies', 'Feed wheat extended last week''s gains while fertiliser eased again. Barley held steady; rapeseed softened slightly.',
   '[{"heading":"Grain","body":"The synthetic feed wheat index closed the week at £176.50/t, up £4.50 on the week. Milling premiums were steady."},{"heading":"Inputs","body":"Ammonium nitrate is quoted at £340/t in the synthetic survey, the lowest level for several weeks. Urea followed lower."},{"heading":"Fuel","body":"Red diesel moved little on the week."}]'),
  ('2026-09-29', 'Quiet start to the week', 'A quiet session with little change across grain and inputs.',
   '[{"heading":"Grain","body":"Feed wheat and barley were little changed in thin trade."},{"heading":"Inputs","body":"Fertiliser quotes were steady ahead of the autumn buying window."}]'),
  ('2026-09-28', 'Weekly round-up: wheat recovers', 'Wheat recovered part of September''s fall; fertiliser prices continued to drift lower.',
   '[{"heading":"Grain","body":"Feed wheat recovered towards £176/t by the end of the week."},{"heading":"Inputs","body":"Nitrogen prices drifted lower for a third week."},{"heading":"Fuel","body":"Diesel steady."}]'),
  ('2026-09-25', 'Rapeseed softens', 'Oilseed rape eased while cereals held their ground.',
   '[{"heading":"Grain","body":"Cereals were steady. Oilseed rape eased on weaker vegetable oil markets."}]'),
  ('2026-09-24', 'Barley demand steady', 'Feed barley demand from compounders held steady.',
   '[{"heading":"Grain","body":"Feed barley held its discount to wheat."},{"heading":"Inputs","body":"Urea quotes were slightly lower."}]'),
  ('2026-09-23', 'Mixed session', 'Mixed moves across grain; inputs a touch lower.',
   '[{"heading":"Grain","body":"Wheat edged up, barley edged down."}]'),
  ('2026-09-22', 'Wheat dips on the week open', 'Wheat started the week lower before finding support.',
   '[{"heading":"Grain","body":"Feed wheat opened the week near £172/t."},{"heading":"Fuel","body":"Red diesel was unchanged."}]')
ON CONFLICT (brief_date) DO NOTHING;
