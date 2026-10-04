# Grain Desk - progress

| Stage | Status | Date | Notes |
|---|---|---|---|
| Kick-off | Done | 30 Sep 2026 | Shell, 10 pages, theme tokens, Vitest; database connected (no tables) |
| 0 Plan | Done | 30 Sep 2026 | docs/PLAN.md; questions answered with defaults marked [assumed] |
| 1 Accounts, farms, security | Partly done | 30 Sep 2026 | Sign in/up, profiles, farms, members, audit log, RLS, Downland Farm demo per user. Still to do: invitations, support access, admins, security self-test |
| 2 Market data and registry | Partly done | 30 Sep 2026 | Sources, series, 157 weeks synthetic prices (8 series), licence-aware read rule, Markets page and Overview snapshot. Still to do: ingest function, admin registry, canUse tests |
| 3 Calculation engine | Partly done | 30 Sep 2026 | Position maths in supabase/functions/_shared/engine (alias @engine); Position, margin (Fixture B) and alert trigger maths with tests; Fixtures A, B, C pass. Still to do: quotes fixtures (D, E) |
| 4 Position ledger | Partly done | 30 Sep 2026 | crops, merchants, contracts (RLS, audit, same-farm keys); demo seed; read-only Position page. Still to do: add/edit contracts, stores, deliveries, targets, quotes |
| 5 Margin tracker | Partly done | 30 Sep 2026 | cost_lines (fixed or price-linked), demo seed, Margin page with breakdown and what-if sliders. Still to do: edit cost lines |
| 6 Alerts, outbox, approvals | Partly done | 30 Sep 2026 | alert_rules, messages, Alerts page (create, pause, delete, live triggered status, desk messages). Still to do: evaluation job, outbox sending, approvals |
| 7 Contract and quote checker | Partly done | 30 Sep 2026 | documents table, private farm-documents bucket, upload/list/open/delete page. Still to do: extract-document function (needs ANTHROPIC_API_KEY) |
| 8 Desk chat | Partly done | 30 Sep 2026 | Placeholder page showing figures the desk will use. Still to do: desk-chat function (needs ANTHROPIC_API_KEY) |
| 9 Daily brief | Partly done | 30 Sep 2026 | briefs table, 7 synthetic briefs, Brief page with per-farm section from the engine. Still to do: ingest-brief function |
| 10 Overview, onboarding, quick log | Not started | | |
| 11 Billing, consent, admin | Not started | | |
| 12 Hardening and handover | Not started | | |

## Standing rules

- Every farm-scoped table gets RLS through the helper functions, the audit trigger, and a row in the security self-test.
- The engine is the only source of user-visible numbers; fixtures are locked after Stage 3.

## Next

Finish Stage 1 (invitations, support access, admin, security self-test), then Stage 2 ingest.
