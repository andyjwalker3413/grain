GRAIN DESK INTEGRATION CONTRACT v1 - the box to the Bolt app

1. PRINCIPLES
- Push only. The box calls the Bolt app over HTTPS. The app never calls the box, and the box opens no inbound ports.
- Release gate. The box sends a date's market data and brief only after that date's brief has been emailed to Mat. History follows the same rule.
- Licence gate. Only sources whose licence_class is display or chart ever leave the box. describe_only and store sources stay on the box, and the app refuses them. The box's class is the ceiling: the app's admin may restrict a source further, never loosen it.
- Scope. licence_scope "single_client" means the app shows the source only to farms its admin has permitted on that source; with none permitted, nobody sees it. "general" means any farm.
- Idempotent. Every call is safe to repeat. The app upserts on natural keys: sources and series by code, observations by (series, date), briefs by date.
- No currency conversion and no FX content. Values stay in their own unit.

2. AUTHENTICATION
- Every call except run-daily-cycle sends: x-ingest-key: <INGEST_KEY>
- run-daily-cycle sends: x-cron-secret: <CRON_SECRET>
- If the platform requires it, every call also sends Authorization: Bearer <BOLT_ANON_KEY> and apikey: <BOLT_ANON_KEY>. The app's docs/INTEGRATION.md says whether it does. The anon key is public; the ingest key is the real authorisation.
- Key rotation: while INGEST_KEY_NEXT is set in the app, it is accepted as well as INGEST_KEY.
- Keys are 40+ random characters, held in Bolt secrets and the box's .env, and never logged.
- Every JSON body carries "contract_version": "1". The app refuses any other version with 400.

3. ENDPOINTS - all POST, under the Bolt functions base URL
- sync-catalogue: upsert sources and series. JSON, sample A.
- ingest-market-data: upsert observations for one source. JSON, sample B. At most 5,000 observations per call.
- ingest-brief: upsert one released brief and its PDF. multipart/form-data: field "payload" (JSON, sample C) and optional field "pdf" (application/pdf, at most 10 MB). sections may be empty when a PDF is attached (archive entries). edition is weekday_short or friday_full; a box with no edition concept sends weekday_short.
- run-daily-cycle: evaluate alerts for a date. JSON {"as_of": "YYYY-MM-DD"}.
- ingest-heartbeat: record a publisher pass. JSON, sample D. phase is started or finished; each stream is ok, skipped, failed or paused.
Success, every endpoint: {"ok": true, "request_id": "...", "run_id": "...", "received": 0, "inserted": 0, "updated": 0, "rejected": [], "warnings": []}
Error, every endpoint: {"ok": false, "request_id": "...", "error": "<code>", "detail": "..."}

4. ERRORS AND WHAT THE BOX DOES
- 400 bad JSON, schema or contract_version: stop that stream, email Will, no retry.
- 401 missing or wrong key: stop all streams, email Will.
- 403 caller IP not allowed: stop all streams, email Will.
- 413 payload too large: split in half and resend.
- 422 unknown code, or licence refused: stop that stream, email Will with the codes.
- 429 rate limited (120 calls a minute per key): wait for Retry-After, then retry.
- 503 paused by the app's admin: spool, retry at the next pass.
- Other 5xx, or a timeout: retry after 1, 2 and 4 minutes, then spool.
Timeouts: connect 10 seconds, read 60 seconds.

5. UNITS AND DATES
- unit is one of: GBP_per_t, GBP_per_l, EUR_per_t, USD_per_t, USc_per_bu, USD_per_bbl, p_per_therm, index. GBP units are pounds, not pence: red diesel is 0.8353, not 83.53.
- date is the market date the value refers to, as an ISO date: the trading date for daily series, the week-ending date as published for weekly series, the first day of the month for monthly series.
- Timestamps are ISO 8601 with an offset. The clock is Europe/London.

6. DAILY TIMING - weekdays, UK bank holidays skipped
1. 05:45 the box's ingest runs, unchanged.
2. By 06:45 the brief is generated, reviewed and emailed to Mat, unchanged.
3. 06:50 publisher pass: heartbeat started, sync-catalogue, ingest-market-data, ingest-brief, run-daily-cycle, heartbeat finished.
4. 07:20 and 09:00 retry passes. With nothing new, they send a heartbeat only.
5. From about 07:00 Mat sees the day's data and brief. Alerts wait in the app's outbox for Will's approval.

7. VERSIONING
Any change to this contract becomes v2 and is made on both sides together.

8. SAMPLES - codes, values and hashes are illustrative; the real catalogue comes from the box's inventory

Sample A - sync-catalogue
{
  "contract_version": "1",
  "sent_at": "2026-10-05T06:50:04+01:00",
  "sources": [
    {
      "code": "desnz_fuel",
      "name": "DESNZ fuel price statistics",
      "owner": "Department for Energy Security and Net Zero",
      "url": "https://example.org/source-page",
      "licence_class": "display",
      "licence_scope": "general",
      "attribution_text": "Contains public sector information licensed under the Open Government Licence v3.0.",
      "independence": "public_body",
      "merchant_interest_note": null,
      "refresh_cadence": "weekly"
    },
    {
      "code": "example_exchange",
      "name": "Example exchange (sample only)",
      "owner": "Example exchange",
      "url": "https://example.org/exchange",
      "licence_class": "chart",
      "licence_scope": "single_client",
      "attribution_text": "Example exchange data.",
      "independence": "exchange",
      "merchant_interest_note": null,
      "refresh_cadence": "daily"
    }
  ],
  "series": [
    {
      "code": "red_diesel_uk",
      "source_code": "desnz_fuel",
      "name": "Red diesel, UK average",
      "commodity": "red_diesel",
      "basis": "list_price",
      "unit": "GBP_per_l",
      "region": "UK",
      "delivery_period": null,
      "frequency": "weekly"
    },
    {
      "code": "example_feed_wheat_nearby",
      "source_code": "example_exchange",
      "name": "Example feed wheat futures, nearby",
      "commodity": "feed_wheat",
      "basis": "futures",
      "unit": "GBP_per_t",
      "region": "UK",
      "delivery_period": "nearby",
      "frequency": "daily"
    }
  ]
}

Sample B - ingest-market-data
{
  "contract_version": "1",
  "run_id": "2026-10-05T0550Z-7f3a",
  "source_code": "desnz_fuel",
  "series": [
    {
      "code": "red_diesel_uk",
      "observations": [
        {
          "date": "2026-09-28",
          "value": 0.8353,
          "provenance": {
            "file": "data/2026-10-05.json",
            "sha256": "42f5c01b6d2fc46b02e746bbdef1d412f76d2c1ef84ec121e122bc6a48c0a459",
            "captured_at": "2026-10-05T04:47:10Z"
          }
        }
      ]
    }
  ]
}

Sample C - ingest-brief, the "payload" field
{
  "contract_version": "1",
  "run_id": "2026-10-05T0550Z-7f3a",
  "date": "2026-10-05",
  "edition": "weekday_short",
  "title": "Hampshire Grain Desk, Monday 5 October 2026",
  "released_at": "2026-10-05T06:45:02+01:00",
  "word_count": 1164,
  "sections": [
    {
      "id": "fuel_and_fertiliser",
      "heading": "Fuel and fertiliser",
      "body_markdown": "Red diesel eased on the week.",
      "source_codes": ["desnz_fuel"],
      "chart_refs": ["red_diesel_uk"]
    }
  ],
  "watchlist": [
    {"label": "Example item", "detail": "Illustrative text."}
  ],
  "pdf": {
    "filename": "grain-desk-2026-10-05.pdf",
    "sha256": "0493b0d5d09f541aa8457550b87708df921a0b299589553a27491ed253ab89a2",
    "bytes": 312456
  }
}

Sample D - ingest-heartbeat
{
  "contract_version": "1",
  "run_id": "2026-10-05T0550Z-7f3a",
  "phase": "finished",
  "started_at": "2026-10-05T06:50:01+01:00",
  "finished_at": "2026-10-05T06:51:12+01:00",
  "streams": {"catalogue": "ok", "market": "ok", "brief": "ok", "daily_cycle": "ok"},
  "counts": {"observations_sent": 42, "quarantined": 0, "spooled": 0},
  "warnings": []
}
