# Grain Desk - progress

| Stage | Status | Date | Notes |
|---|---|---|---|
| Kick-off | Done | 30 Sep 2026 | Shell, 10 pages, theme tokens, Vitest; database connected (no tables) |
| 0 Plan | Done | 30 Sep 2026 | docs/PLAN.md; questions answered with defaults marked [assumed] |
| 1 Accounts, farms, security | Partly done | 16 Nov 2026 | Sign in/up, profiles, farms, members, audit log, RLS, Downland Farm demo per user. Platform admins: app_admins, filled by admin-sync from ADMIN_EMAILS (currently empty); is_app_admin(). Security self-test: 129 checks including the box link, admin actions and a two-farm test over every farm table and verb. Still to do: invitations, support access, password reset UI, farm deletion (blocked by the audit trigger, see B2) |
| 2 Market data and registry | Partly done | 16 Nov 2026 | Sources, series, 157 weeks synthetic prices (8 series), licence-aware read rule, Markets page and Overview snapshot. B2: box catalogue and price ingest with licence ceiling, provenance, contract units. Still to do: Markets page for contract units, canUse tests |
| 3 Calculation engine | Partly done | 30 Sep 2026 | Position maths in supabase/functions/_shared/engine (alias @engine); Position, margin (Fixture B) and alert trigger maths with tests; Fixtures A, B, C pass. Still to do: quotes fixtures (D, E) |
| 4 Position ledger | Partly done | 30 Sep 2026 | crops, merchants, contracts (RLS, audit, same-farm keys); demo seed; read-only Position page. Still to do: add/edit contracts, stores, deliveries, targets, quotes |
| 5 Margin tracker | Partly done | 30 Sep 2026 | cost_lines (fixed or price-linked), demo seed, Margin page with breakdown and what-if sliders. Still to do: edit cost lines |
| 6 Alerts, outbox, approvals | Partly done | 4 Oct 2026 | alert_rules, messages, alert_events, Alerts page. B2: run-daily-cycle evaluates rules once per rule and date, queues messages for approval. Still to do: outbox sending, approvals |
| 7 Contract and quote checker | Partly done | 30 Sep 2026 | documents table, private farm-documents bucket, upload/list/open/delete page. Still to do: extract-document function (needs ANTHROPIC_API_KEY) |
| 8 Desk chat | Partly done | 30 Sep 2026 | Placeholder page showing figures the desk will use. Still to do: desk-chat function (needs ANTHROPIC_API_KEY) |
| 9 Daily brief | Partly done | 4 Oct 2026 | briefs table, 7 synthetic briefs, Brief page. B2: ingest-brief (one per date, private brief-pdfs bucket, sha and size checked, banned-phrase warnings). Still to do: Brief page for box briefs (next stage) |
| 10 Overview, onboarding, quick log | Not started | | |
| 11 Billing, consent, admin | Partly done | 4 Oct 2026 | Built: Admin > Box link only (accept-data switch, heartbeat, last success per stream, series staleness, warnings, source restriction, Run now). Not built: billing, consent records |
| 12 Hardening and handover | Not started | | |

## B2 box link (contract v1)

- Functions deployed and active: sync-catalogue, ingest-market-data, ingest-brief, ingest-heartbeat, run-daily-cycle (verify_jwt false); admin-sync (verify_jwt true). Config in supabase/config.toml.
- Source in supabase/functions/_shared/{boxlink,server}; `npm run bundle:functions` writes each function's index.ts. Rebundle before deploying.
- Contract in docs/CONTRACT.md; curl examples and deployed state in docs/INTEGRATION.md.
- Security self-test: `npm run selftest:security` signs up three throwaway users (one non-admin, and two farm owners), prints PASS/FAIL, and names the users and farms to delete afterwards. Last run 16 Nov 2026: 129 PASS, 0 FAIL.
- Open: INGEST_KEY, CRON_SECRET and ADMIN_EMAILS are read by the code but their presence in the function environment has not been confirmed. Live success, 429, 503 and admin sign-in calls are untested over HTTP.
- Live calls from the box (success, 429 and 503) are tested at first live contact, from the box, not in the app's own checks.
- Open defect: deleting a farm fails because the audit trigger writes an audit row referencing the farm after the cascade has removed it (foreign key error 23503). Throwaway test farms from self-test runs therefore remain; fix before farm deletion is built.
- app_admins has no rows as of 16 Nov 2026. Admin access needs ADMIN_EMAILS set, then a sign-in by that account.

## Standing rules

- Every farm-scoped table gets RLS through the helper functions, the audit trigger, and a row in the security self-test.
- The engine is the only source of user-visible numbers; fixtures are locked after Stage 3.
- Box data never reaches the database except through the five box functions; no sample rows are left behind after tests.

## Next

Confirm the box secrets are visible to the functions, confirm an admin row exists after an admin sign-in, and run one live publisher pass; then fix the farm deletion defect; then the next stage (Brief and Markets pages for box data), then finish Stage 1.
