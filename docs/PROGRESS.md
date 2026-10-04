# Grain Desk - progress

| Stage | Status | Date | Notes |
|---|---|---|---|
| Kick-off | Done | 30 Sep 2026 | Shell, 10 pages, theme tokens, Vitest; database connected (no tables) |
| 0 Plan | Done | 30 Sep 2026 | docs/PLAN.md; questions answered with defaults marked [assumed] |
| 1 Accounts, farms, security | Partly done | 4 Oct 2026 | Sign in/up, profiles, farms, members, audit log, RLS, Downland Farm demo per user. Platform admins via ADMIN_EMAILS (admin-sync, app_admins, is_app_admin). Security self-test started: box link and admin actions (37 checks). Still to do: invitations, support access, two-farm self-test of every farm table and verb |
| 2 Market data and registry | Partly done | 4 Oct 2026 | Sources, series, 157 weeks synthetic prices (8 series), licence-aware read rule, Markets page and Overview snapshot. B2: box catalogue and price ingest with licence ceiling, provenance, contract units. Still to do: Markets page for contract units, canUse tests |
| 3 Calculation engine | Partly done | 30 Sep 2026 | Position maths in supabase/functions/_shared/engine (alias @engine); Position, margin (Fixture B) and alert trigger maths with tests; Fixtures A, B, C pass. Still to do: quotes fixtures (D, E) |
| 4 Position ledger | Partly done | 30 Sep 2026 | crops, merchants, contracts (RLS, audit, same-farm keys); demo seed; read-only Position page. Still to do: add/edit contracts, stores, deliveries, targets, quotes |
| 5 Margin tracker | Partly done | 30 Sep 2026 | cost_lines (fixed or price-linked), demo seed, Margin page with breakdown and what-if sliders. Still to do: edit cost lines |
| 6 Alerts, outbox, approvals | Partly done | 4 Oct 2026 | alert_rules, messages, Alerts page. B2: run-daily-cycle evaluates rules once per rule and date (alert_events), queues messages for approval. Still to do: outbox sending, approvals |
| 7 Contract and quote checker | Partly done | 30 Sep 2026 | documents table, private farm-documents bucket, upload/list/open/delete page. Still to do: extract-document function (needs ANTHROPIC_API_KEY) |
| 8 Desk chat | Partly done | 30 Sep 2026 | Placeholder page showing figures the desk will use. Still to do: desk-chat function (needs ANTHROPIC_API_KEY) |
| 9 Daily brief | Partly done | 4 Oct 2026 | briefs table, 7 synthetic briefs, Brief page. B2: ingest-brief (one per date, private brief-pdfs bucket, sha and size checked, banned-phrase warnings). Still to do: Brief page for box briefs (next stage) |
| 10 Overview, onboarding, quick log | Not started | | |
| 11 Billing, consent, admin | Partly done | 4 Oct 2026 | Admin > Box link: accept-data switch, heartbeat, last success per stream, series staleness (weekends and England bank holidays), warnings, source restriction, Run now |
| 12 Hardening and handover | Not started | | |

## B2 box link (contract v1)

- Functions (verify_jwt false): sync-catalogue, ingest-market-data, ingest-brief, ingest-heartbeat, run-daily-cycle. admin-sync (verify_jwt true).
- Source in supabase/functions/_shared/{boxlink,server}; `npm run bundle:functions` writes each function's index.ts. Rebundle before deploying.
- Contract in docs/CONTRACT.md; curl examples in docs/INTEGRATION.md section 7.
- Security self-test: `npm run selftest:security` signs up a throwaway non-admin, prints PASS/FAIL, and names the user id to delete afterwards. Last run 4 Oct 2026: 37 PASS, 0 FAIL; throwaway users deleted.
- Open: on 4 Oct 2026 the function secrets list did not show INGEST_KEY, CRON_SECRET or ADMIN_EMAILS, so live success, 429 and 503 calls and admin sign-in are untested over HTTP.

## Standing rules

- Every farm-scoped table gets RLS through the helper functions, the audit trigger, and a row in the security self-test.
- The engine is the only source of user-visible numbers; fixtures are locked after Stage 3.
- Box data never reaches the database except through the five box functions; no sample rows are left behind after tests.

## Next

Confirm the box secrets are visible to the functions and run one live publisher pass; then the next stage (Brief and Markets pages for box data), then finish Stage 1.
