# Grain Desk - integration surface (wiring stage B1)

Snapshot of what is built on 4 Oct 2026. Documentation only; nothing here changes behaviour.

## 1. Build status

| Stage | Status | What exists / what is missing |
|---|---|---|
| 1 Accounts, farms, security | Partly | Sign-up/in/out, profiles, farms, farm_members, audit_log + trigger, RLS helpers. Missing: invitations, support access, app_admins, ADMIN_EMAILS sync, security self-test, password reset UI |
| 2 Market data, registry | Partly | sources, market_series, market_observations, DB-level licence read rule, Markets page. Missing: ingest_runs, ingest-market-data, canUse() guard + tests, admin registry, daily synthetic seed |
| 3 Engine | Partly | `supabase/functions/_shared/engine/` (position, margin, alerts) with Fixtures A-C tests. Missing: quotes (D), alert rules (E), explain objects, calc-selftest |
| 4 Position ledger | Partly | crops, merchants, contracts; read-only Position page. Missing: stores, stock_lots, deliveries, targets, quotes, edit forms, Test as of |
| 5 Margin tracker | Partly | cost_lines (fixed or market-linked); Margin page with what-if sliders. Missing: fields, cost-line editing, charts |
| 6 Alerts, outbox | Partly | alert_rules, messages; Alerts page evaluates rules live in the browser. Missing: alert_events, run-daily-cycle, approvals, delivery |
| 7 Checker | Partly | documents table, private `farm-documents` bucket, upload page. Missing: extraction, AI module, llm_calls |
| 8 Desk chat | Placeholder | Page only; no function |
| 9 Daily brief | Partly | briefs table, 7 synthetic briefs, Brief page with per-farm block. Missing: ingest-brief, PDFs, editions, brief_reads |
| 10, 11, 12 | Not started | |
| Stretch S1-S4 | Not started | |

## 2. Server functions

**None are deployed.** `supabase/functions/` holds only `_shared/engine/`; there is no `supabase/config.toml` yet. The browser talks to the database directly through RLS (`src/lib/supabase.ts`).

Platform behaviour for calls from outside the browser:
- Functions live at `https://<project-ref>.supabase.co/functions/v1/<slug>`.
- With `verify_jwt = true` (the default), the gateway requires `Authorization: Bearer <JWT>`; the project's anon key is a valid JWT and passes. The `apikey` header is not required for functions.
- JWT verification can be switched off per function with `[functions.<slug>] verify_jwt = false` in `supabase/config.toml`. The function must then authenticate the caller itself (e.g. an `x-ingest-key` header compared in constant time with a secret).

Only database-level callables exist today (Postgres RPC, signed-in users only): `create_demo_farm()`. `seed_demo_position` and `seed_demo_extras` are revoked from every client role.

## 3. Functions the link will reuse

| Function | Planned (PLAN.md) | Current state | Gap for a separate server |
|---|---|---|---|
| ingest-market-data | `x-ingest-key` = INGEST_KEY; Zod; idempotent upsert; 401/422; ingest_runs row | Not built | Everything: function, config entry with `verify_jwt = false`, ingest_runs table, source fields for licence scope and status, a way to refuse describe_only/store sources |
| ingest-brief | `x-ingest-key`; brief JSON + optional PDF; one brief per date | Not built | Function; briefs lacks edition, pdf_path, source_run_id, status, word count; no storage bucket for brief PDFs; `is_synthetic` defaults to true |
| run-daily-cycle | `x-cron-secret` = CRON_SECRET or signed-in admin; batched; idempotent by as-of | Not built | Function; alert_events with dedupe key; daily_cycle_runs; outbox statuses; app_admins. Alerts are currently computed only in the browser |

Also not present: sync-catalogue and heartbeat endpoints, and any table to hold heartbeats.

## 4. Registered sources and series, and where codes are used

All are synthetic, `is_synthetic = true`, `status = active`. Codes are the text primary keys.

| Source id | Licence | Series id (commodity, unit) |
|---|---|---|
| syn-grain | chart | feed-wheat, milling-wheat, feed-barley, oilseed-rape (grain, £/t) |
| syn-inputs | chart | ammonium-nitrate, urea (fertiliser, £/t) |
| syn-fuel | display | red-diesel (fuel, p/litre) |
| syn-newsletter | describe_only | newsletter-wheat (grain, £/t) |

Each series: 157 weekly Monday values, 2 Oct 2023 - 28 Sep 2026, `numeric(12,2)` in pounds or pence (not integer pence). Rows are stored for the describe_only series; RLS stops browsers reading them.

Allowed `sources` columns today: id, name, licence_class (display|chart|describe_only|store), independence (free text), status (active|paused), is_synthetic, notes. No url, scope, attribution, refresh cadence or licence_unverified status.

References to series codes or synthetic data:
- **Crop reference series:** `crops.reference_series_id` FK to market_series; demo seed `seed_demo_position` sets feed-wheat, feed-barley, oilseed-rape (migration `20260930180754`).
- **Market-following cost lines:** `cost_lines.series_id` FK; demo seed `seed_demo_extras` links ammonium-nitrate (wheat, barley) and urea (OSR); fuel lines are fixed £/ha, not linked to red-diesel (migration `20260930181611`). Cost = qty_per_ha (t/ha) x latest series value.
- **Markets page:** `src/markets/marketData.ts` reads every series; `canShowValues` (active + display|chart) and `canChart` (active + chart) gate UI; `formatValue`/`unitSuffix` infer £ vs pence from the unit string. `SeriesCard` shows a synthetic badge; `MarketsPage` has a fixed "synthetic test data" banner.
- **Overview:** `src/pages/OverviewPage.tsx` hard-codes `SNAPSHOT_IDS = feed-wheat, oilseed-rape, ammonium-nitrate, red-diesel`.
- **Position, Margin, Alerts, Brief, Desk chat pages:** use `fetchLatestPair(reference_series_id)` via `src/position/positionData.ts` and `src/margin/marginData.ts`; "weekly move" is the latest two observations, whatever their spacing.
- **Brief chart_refs:** none. Synthetic brief sections are heading/body JSON with prices written into text; the Brief page labels every brief "Synthetic test brief".
- **Desk chat tools:** none exist.
- **Daily cycle:** none exists. Seeded demo messages contain prices as text.
- **Copy:** AuthPage, MarginPage, PositionPage state the data is synthetic.
- **Fixture alignment:** migration `20260930175608` overwrites feed-wheat (21 and 28 Sep 2026) and ammonium-nitrate (28 Sep 2026) to match the engine fixtures.

## 5. Secrets read, by name

- Browser (build-time, public): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `src/lib/supabase.ts`.
- Server functions: none yet. Bolt secrets configured: none. Planned: ADMIN_EMAILS, INGEST_KEY, CRON_SECRET, ANTHROPIC_API_KEY, RESEND_API_KEY (optional). Platform-provided to functions: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

## 6. Caller IP address

Supabase's function gateway forwards the client address in `x-forwarded-for` (first entry). It isn't documented as a guarantee and could pass through extra proxies, so use it for logging and rate-limit hints only, never for authentication or an allowlist. B2 should log it on a test call from the box to confirm what arrives.

## 7. Box settings (for Will)

```
FUNCTIONS_BASE_URL = https://qkkyckglzpjqbvxpskts.supabase.co/functions/v1
BOLT_ANON_KEY      = not needed if every box-facing function is deployed with verify_jwt = false
                     (planned for B2). Fallback only, public key, safe to share:
                     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFra3lja2dsenBqcWJ2eHBza3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODUyNzEsImV4cCI6MjEwNjM2MTI3MX0.hyl_COtRsaXKWgtTofc-ev91-fzkMmrrG-c7SBr-2gI
INGEST_KEY         = set in Bolt secrets and on the box (value not recorded here)
CRON_SECRET        = set in Bolt secrets and on the box (value not recorded here)
```
