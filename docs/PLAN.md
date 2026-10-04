# Grain Desk Phase 2 - build plan

Prototype on synthetic data. Follows the project knowledge (hard limits 1-10). Answers marked **[assumed]** are defaults pending confirmation (see Questions).

## 1. Data model (farm_id is the tenancy key; RLS on every table)

Helpers (SQL, SECURITY DEFINER, fixed search_path, EXECUTE to authenticated only): `is_farm_member(farm_id)`, `farm_role(farm_id)`, `can_edit_farm(farm_id)` (owner or member), `is_app_admin()`.

Standard farm-scoped rule ("FS"): SELECT if member of the farm (any role); INSERT/UPDATE/DELETE if owner or member; advisers read only; admins get no direct access. Every FS table carries the audit trigger and joins the security self-test.

| Table | Key columns | RLS in plain words |
|---|---|---|
| profiles | user_id, full_name | You read and edit your own; you can see names of people in your farms |
| farms | id, name, county, total_ha, finance_rate, deletion_requested_at | Members read; owner edits; anyone signed in can create one (becomes owner) |
| farm_members | farm_id, user_id, role | Members read the list; owner adds, changes, removes; last owner can't be removed |
| invitations | farm_id, email, role, token_hash, expires_at, accepted_at | Owner manages; accepting goes through a server function |
| app_admins | user_id | Only admins read; written only by server function |
| support_access_grants | farm_id, admin_id, granted_by, expires_at, reason, revoked_at | Owner creates and revokes; the named admin reads their own grants |
| audit_log | farm_id, actor, table, row_id, action, before, after, at | Members read their farm's history; no one edits or deletes |
| sources, market_series | licence_class, independence, status... | Read by signed-in users; written by server functions only |
| market_observations | series_id, observed_on, value | Read only where the source is active and licence is display or chart **[assumed]**; describe_only/store values never leave the server |
| ingest_runs | source, counts, errors | Admins only |
| crops, stores, stock_lots, merchants, contracts, deliveries, targets, quotes | per Stage 4 | FS |
| fields, cost_lines | per Stage 5 | FS |
| alert_rules, alert_events | per Stage 6 | FS (events written by the daily cycle only) |
| messages | outbox, tier, status, approvals | Farm members read their farm's delivered in-app messages; admins read all in the approval queue; writes by server functions only |
| approval_policies | message_type, tier, sample_rate | Admins only |
| notification_prefs | user_id, channels, quiet hours | Your own only |
| documents | farm_id, file_path, status, extraction | FS; storage bucket `farm-documents` with paths `farm_id/...`, same rule |
| llm_calls, llm_budgets | feature, farm, model, tokens, usd, latency | Admins read; farms never; written by the AI module |
| prompts | name, version, body, active | Admins only |
| chat_conversations, chat_messages | farm_id, user_id, tool calls | You read and delete your own within your farm |
| briefs, brief_reads | per Stage 9 | Briefs readable by signed-in users; reads your own |
| onboarding_progress | farm_id, step, data | FS |
| consent_records | user_id, purpose, version, given | Your own; append-only |
| subscriptions | farm_id, stripe ids, plan, status | Members read; webhook writes |
| daily_cycle_runs, error_log | admin telemetry | Admins only |

Money is integer pence (`_p` columns); tonnes numeric(12,3); rates numeric.

## 2. Calculation engine location and sharing

- Canonical code: `supabase/functions/_shared/engine/` - pure TypeScript, relative imports with `.ts` extensions, no Deno, Node, React, Supabase or clock imports.
- Web app imports it through a path alias `@engine/*` (vite.config + tsconfig). Server functions import `../_shared/engine/index.ts`.
- Fixtures in `supabase/functions/_shared/engine/fixtures/`, tests alongside, run by Vitest. Locked after Stage 3.
- Risk: the deploy tool must bundle `_shared`. calc-selftest proves it. Fallback: a copy step with a hash test that fails if the two copies differ.

## 3. Server functions

All: Zod input, typed errors `{ code, message }`, CORS, request id. Service-role key only on the server.

| Function | Caller | Input -> output | Secrets |
|---|---|---|---|
| admin-sync | any signed-in user, on sign-in | none -> { is_admin } | ADMIN_EMAILS |
| accept-invitation | signed-in user | token -> farm_id | - |
| support-read | admin with live grant | farm_id, resource -> rows; logs each read to audit_log | - |
| security-selftest | admin | none -> PASS/FAIL table | - |
| seed-demo | admin | reset? -> summary (Downland Farm, re-runnable) | - |
| ingest-market-data | x-ingest-key | run payload -> counts; 401/422 | INGEST_KEY |
| seed-synthetic-markets | admin | none -> counts | - |
| market-describe | signed-in | series, period -> direction word only | - |
| calc-selftest | admin | none -> Fixture A result | - |
| run-daily-cycle | x-cron-secret or admin | as_of -> run summary (batched) | CRON_SECRET, RESEND_API_KEY (optional) |
| review-message | admin | id, approve/confirm/reject, reason -> status | RESEND_API_KEY (optional) |
| extract-document | farm editor | document_id -> 202; background extraction | ANTHROPIC_API_KEY |
| inbound-email | Postmark webhook | Postmark JSON -> documents | ANTHROPIC_API_KEY, INBOUND_TOKEN **[assumed]** |
| desk-chat | farm member, Plus plan | conversation, message -> stream | ANTHROPIC_API_KEY |
| red-team | admin | none -> results and transcripts | ANTHROPIC_API_KEY |
| ingest-brief | x-ingest-key | brief JSON + optional PDF -> brief id | INGEST_KEY |
| quick-log | farm editor | text -> draft (nothing written) | ANTHROPIC_API_KEY |
| export-farm | owner | farm_id -> zip in private storage, signed link | - |
| delete-farm | owner | request/cancel; purge runs in the daily cycle | - |
| stripe-checkout, stripe-portal, stripe-webhook | Bolt Stripe integration | Bolt-generated | Stripe (integration) |

## 4. Daily cycle (no scheduler in Bolt)

`run-daily-cycle` runs: evaluate alert rules -> alert_events (unique dedupe key) -> outbox messages -> approval gates -> delivery of fully approved messages -> purge farms past the 7-day deletion window -> record in daily_cycle_runs. Farms go in batches of 25, and the run returns a cursor if time runs short. For the test, use Admin > Daily cycle > Run now. Later, the box calls it at 06:15 with one curl line. It's idempotent by as-of date.

## 5. Licence enforcement (three layers)

1. **Database:** browsers can only read observations whose source is active and display or chart. describe_only and store values never reach the browser.
2. **Code:** `canUse(source, purpose)` in the engine folder. The only ways to get data out are `getChartableSeries`, `getCalcInput`, `buildExport` and the AI tool wrappers, and each calls canUse. A lint rule bans importing the raw market query anywhere else.
3. **AI:** get_market_series returns a direction word for describe_only sources. The provenance check blocks any number not returned by a tool.

Tests prove a describe_only series can't be charted, exported, listed or quoted, and a store series can't be shown at all.

## 6. Stages, main risk and test

| # | Stage | Main risk | How it's tested |
|---|---|---|---|
| 1 | Accounts, farms, RLS, audit | Cross-farm leaks; logging admin reads | Security self-test (two throwaway farms, every table and verb) |
| 2 | Market data, registry, ingest | Licence bypass; ingest not idempotent | canUse tests; seed twice and compare checksums; 401/422 tests |
| 3 | Engine | Rounding and float errors; code sharing | Fixtures A-E exact; edge cases; calc-selftest vs web |
| 4 | Position ledger | Numbers computed outside the engine | Test-as-of 2 Oct 2026 equals Fixture A |
| 5 | Margin tracker | Slider drift | Fixture B and C on screen and in tests |
| 6 | Alerts, outbox, approvals | A message sent without both approvals | Fixture E run twice; banned-phrase and number checks |
| 7 | Checker | Invented values; time limits | Four test documents; null price; llm_calls rows |
| 8 | Desk chat | Forecasts or unsourced numbers | 25-case red team; provenance unit test |
| 9 | Daily brief | Farm block disagreeing with Position | Same as-of comparison test |
| 10 | Overview, onboarding, quick log | Invented numbers in drafts | 10 test lines; digits must appear in the input |
| 11 | Billing, consent, data rights | Export leaking other farms; incomplete deletion | Export scan; row counts after purge |
| 12 | Hardening, handover | Regressions | Every suite and self-test green |

## 7. What Bolt can't do natively, and the nearest option

- **Python scrapers and PDF brief:** stay on the box and push in through ingest-market-data and ingest-brief.
- **Scheduler:** run-daily-cycle behind CRON_SECRET, with Run now for the test.
- **Logging SELECTs through RLS:** admin support reads go through support-read, which logs each read.
- **Long AI jobs:** background task plus status polling.
- **App email:** needs a verified domain, so messages wait in the outbox without one.
- **Real inbound mailbox:** tested with a sample Postmark payload only.
- **Data residency:** unknown for Bolt-hosted databases, so synthetic data only.
- **Model IDs** (claude-sonnet-5-5 and the others): verified against the Anthropic models list in Stage 7 before use.

## 8. Questions (defaults used until answered)

1. Share the engine through `supabase/functions/_shared`, with a copy-and-hash fallback? **[assumed yes]**
2. Hide describe_only and store observation values from browsers at the database level, which is stricter than "readable by any signed-in user"? **[assumed yes]**
3. Admin support reads only through a logging server function, with no direct table access? **[assumed yes]**
4. The demo farm is owned by the first ADMIN_EMAILS account to sign in. **[assumed]**
5. Harvest year 2026 means grain harvested in 2026; the season runs 1 Jul to 30 Jun. **[assumed]**
6. Plus features stay open to every farm until Stage 11 adds billing. **[assumed]**
7. The inbound email webhook is protected by an INBOUND_TOKEN secret in the URL. **[assumed]**

## Hand check of fixtures (done at planning)

Fixtures A-E were recomputed by hand and all match, including blended £178.41/t, margin at blended £162.60/ha (exact: 181,980 / 120 = £1,516.50 revenue/ha), Fixture C's -£650.00 floor effect, and Fixture D's £1.4966/t difference rounding to £1.50 and £299.32.
