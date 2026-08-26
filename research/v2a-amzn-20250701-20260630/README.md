# V2A AMZN acquisition handoff

The exact V2A acquisition requested AMZN 5-minute regular-session bars for 2025-07-01 through 2026-06-30 with `adjust=none`. Twelve Data returned 19,469 normalized rows in 29 chunks. The quota scheduler recorded one handled HTTP 429 and four quota waits; rejected rows, duplicate rows, and conflicting duplicates were all zero.

Corporate-action status is recorded as `NONE_IN_RANGE` from the Amazon Investor Relations FAQ, which states that Amazon has never declared or paid cash dividends and lists its historical splits as 1998, 1999, and 2022, all before this range. Twelve Data's dividends and splits endpoints returned HTTP 403 for this account; that limitation is retained in `corporate-actions.json` rather than treated as evidence.

The complete-range structural preflight failed because the provider data has one missing 5-minute bar on 2026-04-15 at 19:00 UTC. A targeted same-date provider recheck returned the same 77 bars and the same 10-minute gap. No bar was fabricated, no development model was run, and no protocol artifact or holdout predictive artifact was created.
