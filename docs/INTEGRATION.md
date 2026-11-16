# Grain Desk - integration surface (wiring stage B2)

Snapshot of what is built and deployed on 16 Nov 2026. Documentation only; nothing here changes behaviour.

## 1. Build status

| Stage | Status | What exists / what is missing |
|---|---|---|
| 1 Accounts, farms, security | Partly | Sign-up/in/out, profiles, farms, farm_members, audit_log + trigger, RLS helpers, app_admins (filled by admin-sync from ADMIN_EMAILS), is_app_admin(), two-farm security self-test. Missing: invitations, support access, password reset UI |
| 2 Market data, registry | Partly | sources, market_series, market_observations, licence-aware read rule, Markets page, box catalogue and price ingest (sync-catalogue, ingest-market-data). Missing: Markets page for contract units, canUse() tests |
| 3 Engine | Partly | `supabase/functions/_shared/engine/` (position, margin, alerts) with Fixtures A-C tests. Missing: quotes (D), alert rules (E), explain objects, calc-selftest |
| 4 Position ledger | Partly | crops, merchants, contracts; read-only Position page. Missing: stores, stock_lots, deliveries, targets, quotes, edit forms, Test as of |
| 5 Margin tracker | Partly | cost_lines (fixed or market-linked); Margin page with what-if sliders. Missing: fields, cost-line editing, charts |
| 6 Alerts, outbox | Partly | alert_rules, messages, alert_events; run-daily-cycle evaluates rules once per rule and date and queues messages. Missing: approvals, outbox sending |
| 7 Checker | Partly | documents table, private `farm-documents` bucket, upload page. Missing: extraction, AI module, llm_calls |
| 8 Desk chat | Placeholder | Page only; no function |
| 9 Daily brief | Partly | briefs table, 7 synthetic briefs, Brief page. ingest-brief stores one brief per date with its PDF in the private `brief-pdfs` bucket. Missing: Brief page for box briefs (next stage) |
| 10 Overview, onboarding, quick log | Not started | |
| 11 Billing, consent, admin | Partly | Admin > Box link only (accept-data switch, heartbeat, last success per stream, series staleness, warnings, source restriction, Run now). Billing and consent are not built |
| 12 Hardening and handover | Not started | |
| Stretch S1-S4 | Not started | |

## 2. Server functions

Deployed and active on the project:

| Function | verify_jwt | Caller | Purpose |
|---|---|---|---|
| sync-catalogue | false | box, x-ingest-key | upsert sources and series |
| ingest-market-data | false | box, x-ingest-key | upsert observations for one source |
| ingest-brief | false | box, x-ingest-key | upsert one brief and its PDF |
| ingest-heartbeat | false | box, x-ingest-key | record a publisher pass |
| run-daily-cycle | false | box, x-cron-secret | evaluate alert rules for a date |
| admin-sync | true | signed-in app user | sets app_admins from ADMIN_EMAILS on sign-in |

The settings live in `supabase/config.toml`. The box-facing functions authenticate the caller themselves (the ingest key or the cron secret, compared in constant time), so they run with verify_jwt false. Source for all six is generated into each function's index.ts by `npm run bundle:functions`; rebundle before deploying.

Admin access: `app_admins` lists the platform admins. `is_app_admin()` reads it, and every admin action checks it. `admin-sync` writes the table: a signed-in user whose email is in ADMIN_EMAILS is added, and anyone else is removed. With ADMIN_EMAILS unset, existing rows are left alone and no new admin is added. The table is empty as of 16 Nov 2026.

Only database-level callables are exposed to signed-in users (Postgres RPC). The box RPCs (`box_*`) are not callable by any client role.

## 3. Functions the link reuses

| Function | State |
|---|---|
| ingest-market-data | Built and deployed |
| ingest-brief | Built and deployed |
| run-daily-cycle | Built and deployed; writes daily_cycle_runs and alert_events |
| sync-catalogue, ingest-heartbeat | Built and deployed |

## 4. Registered sources and series, and where codes are used

Four synthetic sources (`syn-grain`, `syn-inputs`, `syn-fuel`, `syn-newsletter`) and eight synthetic series, each with 157 weekly values from 2 Oct 2023 to 28 Sep 2026. All are marked `is_synthetic = true`. The describe_only series (newsletter-wheat) stores its values, and RLS stops browsers reading them.

Allowed `sources` columns: id, name, licence_class (display|chart|describe_only|store), independence, status (active|paused), is_synthetic, notes. Box catalogue fields (url, licence scope, attribution, refresh cadence) are stored through sync-catalogue.

References to series codes or synthetic data:
- **Crop reference series:** `crops.reference_series_id` FK to market_series.
- **Market-following cost lines:** `cost_lines.series_id` FK; cost = qty_per_ha (t/ha) x latest series value.
- **Markets page:** `src/markets/marketData.ts` reads every series; `canShowValues` and `canChart` gate UI. `SeriesCard` shows a synthetic badge.
- **Overview:** `src/pages/OverviewPage.tsx` hard-codes `SNAPSHOT_IDS`.
- **Position, Margin, Alerts, Brief, Desk chat pages:** use `fetchLatestPair(reference_series_id)`.
- **Brief page:** still shows the synthetic briefs; box briefs wait for the next stage.
- **Desk chat tools:** none exist.

## 5. Secrets read, by name

- Browser (build-time, public): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `src/lib/supabase.ts`.
- Server functions, read in code:
  - INGEST_KEY and INGEST_KEY_NEXT (rotation) in `supabase/functions/_shared/server/http.ts`
  - CRON_SECRET in `supabase/functions/_shared/server/http.ts`
  - INGEST_ALLOWED_IPS (optional, comma-separated) in `supabase/functions/_shared/server/http.ts`
  - ADMIN_EMAILS (comma-separated) in `supabase/functions/_shared/server/endpoints/admin-sync.ts`
- Platform-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
- Later stages: ANTHROPIC_API_KEY, RESEND_API_KEY (optional).

Presence of INGEST_KEY, CRON_SECRET and ADMIN_EMAILS in the function environment has not been confirmed. The app's secrets list cannot be read from here. The first live call from the box and a first admin sign-in will confirm them.

## 6. Caller IP address

Supabase's function gateway forwards the client address in `x-forwarded-for` (first entry). It isn't documented as a guarantee and could pass through extra proxies, so use it for logging and rate-limit hints only, never for authentication or an allowlist.

## 7. Box settings (for Will)

```
FUNCTIONS_BASE_URL = https://qkkyckglzpjqbvxpskts.supabase.co/functions/v1
BOLT_ANON_KEY      = not needed. All five box-facing functions are deployed with verify_jwt = false,
                     so send no Authorization or apikey header.
INGEST_KEY         = set in Bolt secrets and on the box (value not recorded here)
CRON_SECRET        = set in Bolt secrets and on the box (value not recorded here)
```

Curl examples. Placeholders only: replace `<INGEST_KEY>` and `<CRON_SECRET>` on the box. For A and B, save the samples from docs/CONTRACT.md section 8 as `sample-a.json` and `sample-b.json`. Every call is a POST and safe to repeat.

```
BASE=https://qkkyckglzpjqbvxpskts.supabase.co/functions/v1

# Sample A - sync-catalogue
curl -sS -X POST "$BASE/sync-catalogue" \
  -H 'x-ingest-key: <INGEST_KEY>' -H 'content-type: application/json' \
  --data @sample-a.json

# Sample B - ingest-market-data (at most 5,000 observations per call)
curl -sS -X POST "$BASE/ingest-market-data" \
  -H 'x-ingest-key: <INGEST_KEY>' -H 'content-type: application/json' \
  --data @sample-b.json

# Sample C - ingest-brief: multipart, field "payload" (sample C) and optional field "pdf" (<= 10 MB).
# payload.pdf.sha256 and payload.pdf.bytes must match the attached file; omit payload.pdf when sending no file.
curl -sS -X POST "$BASE/ingest-brief" \
  -H 'x-ingest-key: <INGEST_KEY>' \
  -F 'payload=<sample-c.json;type=application/json' \
  -F 'pdf=@grain-desk-2026-10-05.pdf;type=application/pdf'

# Sample D - ingest-heartbeat
curl -sS -X POST "$BASE/ingest-heartbeat" \
  -H 'x-ingest-key: <INGEST_KEY>' -H 'content-type: application/json' \
  --data '{"contract_version":"1","run_id":"2026-10-05T0550Z-7f3a","phase":"finished","started_at":"2026-10-05T06:50:01+01:00","finished_at":"2026-10-05T06:51:12+01:00","streams":{"catalogue":"ok","market":"ok","brief":"ok","daily_cycle":"ok"},"counts":{"observations_sent":42,"quarantined":0,"spooled":0},"warnings":[]}'

# run-daily-cycle - uses x-cron-secret, not x-ingest-key
curl -sS -X POST "$BASE/run-daily-cycle" \
  -H 'x-cron-secret: <CRON_SECRET>' -H 'content-type: application/json' \
  --data '{"contract_version":"1","as_of":"2026-10-05"}'
```

Replies follow contract section 3: success `{"ok":true,"request_id",...}`; error `{"ok":false,"request_id","error","detail"}`. Codes: 400 bad_json / schema / contract_version, 401 unauthorised, 403 ip_not_allowed, 405 method_not_allowed, 413 payload_too_large, 422 unknown_code / licence_refused, 429 rate_limited (with Retry-After), 503 paused (body also carries `"paused": true`), 500 internal. The sample PDF hash and size in sample C are illustrative, so a real file must replace them.
