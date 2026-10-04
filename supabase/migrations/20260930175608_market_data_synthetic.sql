/*
# Market data: sources, series and synthetic prices

Plain English: a register of price sources with their licence rules, the price
series each source publishes, and the weekly prices themselves. All values
are SYNTHETIC TEST DATA (clearly labelled) covering Oct 2023 - Sep 2026.

1. New tables
- sources: id, name, licence_class (display|chart|describe_only|store), independence, status (active|paused), is_synthetic, notes
- market_series: id, source_id, commodity (grain|fertiliser|fuel), name, unit, sort_order
- market_observations: series_id, observed_on, value

2. Security
- Signed-in users can read sources and series.
- Signed-in users can read prices ONLY when the source is active AND its licence
  is display or chart. describe_only and store prices never reach the browser.
- No one can write from the app; data arrives only through server-side loading.

3. Notes
- Seed is idempotent (ON CONFLICT DO NOTHING).
- Latest feed wheat (176.50, previous week 172.00) and ammonium nitrate (340)
  match the worked examples used for the calculation tests.
*/

CREATE TABLE IF NOT EXISTS sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  licence_class text NOT NULL CHECK (licence_class IN ('display','chart','describe_only','store')),
  independence text NOT NULL DEFAULT 'independent',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  is_synthetic boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS market_series (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES sources(id),
  commodity text NOT NULL CHECK (commodity IN ('grain','fertiliser','fuel')),
  name text NOT NULL,
  unit text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS market_series_source_idx ON market_series(source_id);

CREATE TABLE IF NOT EXISTS market_observations (
  series_id text NOT NULL REFERENCES market_series(id),
  observed_on date NOT NULL,
  value numeric(12,2) NOT NULL,
  PRIMARY KEY (series_id, observed_on)
);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sources_select" ON sources;
CREATE POLICY "sources_select" ON sources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "market_series_select" ON market_series;
CREATE POLICY "market_series_select" ON market_series FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "market_observations_select_licensed" ON market_observations;
CREATE POLICY "market_observations_select_licensed" ON market_observations FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM market_series s JOIN sources src ON src.id = s.source_id
    WHERE s.id = market_observations.series_id
      AND src.status = 'active' AND src.licence_class IN ('display','chart')));

INSERT INTO sources(id, name, licence_class, independence, notes) VALUES
  ('syn-grain', 'Synthetic Grain Index (test data)', 'chart', 'independent', 'Generated weekly ex-farm prices for testing.'),
  ('syn-inputs', 'Synthetic Inputs Survey (test data)', 'chart', 'independent', 'Generated delivered fertiliser prices for testing.'),
  ('syn-fuel', 'Synthetic Fuel Monitor (test data)', 'display', 'independent', 'Generated red diesel prices for testing.'),
  ('syn-newsletter', 'Synthetic Merchant Newsletter (test data)', 'describe_only', 'merchant', 'Licence allows describing direction only; values are never shown.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_series(id, source_id, commodity, name, unit, sort_order) VALUES
  ('feed-wheat', 'syn-grain', 'grain', 'Feed wheat, ex-farm', '£/t', 1),
  ('milling-wheat', 'syn-grain', 'grain', 'Milling wheat, ex-farm', '£/t', 2),
  ('feed-barley', 'syn-grain', 'grain', 'Feed barley, ex-farm', '£/t', 3),
  ('oilseed-rape', 'syn-grain', 'grain', 'Oilseed rape, delivered', '£/t', 4),
  ('ammonium-nitrate', 'syn-inputs', 'fertiliser', 'Ammonium nitrate 34.5%', '£/t', 5),
  ('urea', 'syn-inputs', 'fertiliser', 'Granular urea 46%', '£/t', 6),
  ('red-diesel', 'syn-fuel', 'fuel', 'Red diesel', 'p/litre', 7),
  ('newsletter-wheat', 'syn-newsletter', 'grain', 'Merchant feed wheat view', '£/t', 8)
ON CONFLICT (id) DO NOTHING;

WITH weeks AS (
  SELECT k, (date '2023-10-02' + k * 7) AS d FROM generate_series(0, 156) AS k
), params(series_id, base, trend, a1, p1, a2, p2) AS (
  VALUES
    ('feed-wheat',       190.0, -0.10, 12.0, 11.0, 5.0, 3.3),
    ('milling-wheat',    222.0, -0.09, 13.0, 11.0, 6.0, 3.1),
    ('feed-barley',      168.0, -0.08, 10.0, 12.0, 4.5, 3.5),
    ('oilseed-rape',     390.0,  0.05, 28.0,  9.0, 12.0, 2.9),
    ('ammonium-nitrate', 355.0, -0.05, 22.0, 13.0, 8.0, 4.1),
    ('urea',             430.0, -0.03, 30.0, 10.0, 10.0, 3.7),
    ('red-diesel',        78.0,  0.02,  6.0, 14.0, 2.5, 4.3),
    ('newsletter-wheat', 188.0, -0.10, 11.0, 11.0, 4.0, 3.0)
)
INSERT INTO market_observations(series_id, observed_on, value)
SELECT p.series_id, w.d,
  round((p.base + p.trend * w.k + p.a1 * sin(w.k / p.p1) + p.a2 * sin(w.k / p.p2 + 1.0))::numeric, 2)
FROM weeks w CROSS JOIN params p
ON CONFLICT (series_id, observed_on) DO NOTHING;

UPDATE market_observations SET value = 172.00 WHERE series_id = 'feed-wheat' AND observed_on = date '2026-09-21';
UPDATE market_observations SET value = 176.50 WHERE series_id = 'feed-wheat' AND observed_on = date '2026-09-28';
UPDATE market_observations SET value = 340.00 WHERE series_id = 'ammonium-nitrate' AND observed_on = date '2026-09-28';
