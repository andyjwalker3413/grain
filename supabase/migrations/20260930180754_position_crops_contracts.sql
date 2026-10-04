/*
# Position ledger basics: crops, merchants, contracts

Plain English: each farm records its crops for a harvest year, the merchants it
sells to, and its sales contracts (fixed price, pool, minimum price). Only the
farm's members can see them; owners and members can change them; advisers read
only. Every change is written to the audit log. Demo farms get synthetic data.

1. New tables
- crops: id, farm_id, name, harvest_year, area_ha, expected_tonnes, reference_series_id (market series used to value unsold grain)
- merchants: id, farm_id, name
- contracts: id, farm_id, crop_id, merchant_id, contract_type (fixed|pool|min_price),
  tonnes, price_p (pence per tonne: fixed price, pool estimate, or minimum), delivery_month, reference, status (open|delivered|cancelled)

2. Security
- RLS on all three; select for farm members; insert/update/delete for owners and members.
- Composite foreign keys stop a contract pointing at another farm's crop or merchant.
- Audit trigger on every table.

3. Demo data
- seed_demo_position(farm) fills Downland Farm: winter wheat 1,020 t (worked example A),
  feed barley and oilseed rape. Not callable from the app; create_demo_farm calls it.
- Existing demo farms are back-filled once.
*/

CREATE TABLE IF NOT EXISTS crops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  harvest_year int NOT NULL CHECK (harvest_year BETWEEN 2000 AND 2100),
  area_ha numeric(10,2) NOT NULL DEFAULT 0 CHECK (area_ha >= 0),
  expected_tonnes numeric(12,3) NOT NULL DEFAULT 0 CHECK (expected_tonnes >= 0),
  reference_series_id text REFERENCES market_series(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, id)
);
CREATE INDEX IF NOT EXISTS crops_farm_idx ON crops(farm_id);

CREATE TABLE IF NOT EXISTS merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, id)
);
CREATE INDEX IF NOT EXISTS merchants_farm_idx ON merchants(farm_id);

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  crop_id uuid NOT NULL,
  merchant_id uuid NOT NULL,
  contract_type text NOT NULL CHECK (contract_type IN ('fixed','pool','min_price')),
  tonnes numeric(12,3) NOT NULL CHECK (tonnes > 0),
  price_p integer NOT NULL CHECK (price_p >= 0),
  delivery_month date,
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','delivered','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (farm_id, crop_id) REFERENCES crops(farm_id, id) ON DELETE CASCADE,
  FOREIGN KEY (farm_id, merchant_id) REFERENCES merchants(farm_id, id)
);
CREATE INDEX IF NOT EXISTS contracts_farm_idx ON contracts(farm_id);
CREATE INDEX IF NOT EXISTS contracts_crop_idx ON contracts(crop_id);
CREATE INDEX IF NOT EXISTS contracts_merchant_idx ON contracts(farm_id, merchant_id);

ALTER TABLE crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crops','merchants','contracts'] LOOP
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

CREATE OR REPLACE FUNCTION public.seed_demo_position(p_farm uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_wheat uuid; v_barley uuid; v_osr uuid;
  v_a uuid; v_b uuid; v_c uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.farms f WHERE f.id = p_farm AND f.is_demo) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.crops c WHERE c.farm_id = p_farm) THEN RETURN; END IF;

  INSERT INTO public.crops(farm_id, name, harvest_year, area_ha, expected_tonnes, reference_series_id)
    VALUES (p_farm, 'Winter wheat', 2026, 120, 1020, 'feed-wheat') RETURNING id INTO v_wheat;
  INSERT INTO public.crops(farm_id, name, harvest_year, area_ha, expected_tonnes, reference_series_id)
    VALUES (p_farm, 'Feed barley', 2026, 80, 544, 'feed-barley') RETURNING id INTO v_barley;
  INSERT INTO public.crops(farm_id, name, harvest_year, area_ha, expected_tonnes, reference_series_id)
    VALUES (p_farm, 'Oilseed rape', 2026, 60, 204, 'oilseed-rape') RETURNING id INTO v_osr;

  INSERT INTO public.merchants(farm_id, name) VALUES (p_farm, 'Merchant A') RETURNING id INTO v_a;
  INSERT INTO public.merchants(farm_id, name) VALUES (p_farm, 'Merchant B') RETURNING id INTO v_b;
  INSERT INTO public.merchants(farm_id, name) VALUES (p_farm, 'Merchant C') RETURNING id INTO v_c;

  INSERT INTO public.contracts(farm_id, crop_id, merchant_id, contract_type, tonnes, price_p, delivery_month, reference, status) VALUES
    (p_farm, v_wheat, v_a, 'fixed', 300, 18200, date '2026-11-01', 'MA-2026-014', 'open'),
    (p_farm, v_wheat, v_b, 'pool', 200, 17800, date '2027-03-01', 'MB-POOL-26', 'open'),
    (p_farm, v_wheat, v_c, 'min_price', 100, 17000, date '2027-01-01', 'MC-MIN-0931', 'open'),
    (p_farm, v_barley, v_a, 'fixed', 200, 15800, date '2026-10-01', 'MA-2026-021', 'delivered'),
    (p_farm, v_barley, v_b, 'fixed', 150, 16350, date '2027-02-01', 'MB-2026-107', 'open'),
    (p_farm, v_osr, v_c, 'fixed', 100, 39200, date '2026-09-01', 'MC-OSR-0412', 'delivered');
END $$;
REVOKE ALL ON FUNCTION public.seed_demo_position(uuid) FROM PUBLIC, anon, authenticated;

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
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_demo_farm() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_demo_farm() TO authenticated;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT id FROM public.farms WHERE is_demo LOOP
    PERFORM public.seed_demo_position(f.id);
  END LOOP;
END $$;
