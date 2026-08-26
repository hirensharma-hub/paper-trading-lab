# First real historical paper-research run

Experiment ID: `first-real-historical-spy-20260701-20260820-v1`

This directory contains public, non-raw research metadata and the reproducible run summary. The Twelve Data CSV and full generated artifact directory are intentionally excluded because the provider data is not redistributed.

## Dataset

- Provider: Twelve Data
- Symbol: SPY
- Interval: 5 minutes
- Requested range: 2026-07-01 through 2026-08-20
- Returned range: 2026-07-01 through 2026-08-20, 09:30–16:00 America/New_York
- Bars: 2,808
- Sessions: 36
- Adjustment parameter: `none`
- Adjustment type: `RAW`
- Canonical dataset hash: `89d1ffed7c6cf56178e239e42a758ca00fbd04aa316e73151cfcc124277d11ea`
- Rejected provider rows: 0
- Conflicting duplicates: 0

The NYSE source lists July 3, 2026 as the observed Independence Day closure and the NYSE Arca core session as 09:30–16:00 ET. State Street's 2026 SPY distribution schedule lists SPY distributions on June 18 and September 18, with none inside this experiment range.

## Splits

- TRAIN: 1,376 observations; first usable row 2026-07-01, last 2026-07-27
- VALIDATION: 388 observations; 2026-07-27 through 2026-08-03
- CALIBRATION: 389 observations; 2026-08-03 through 2026-08-10
- TEST all: 604 observations; 2026-08-10 through 2026-08-20
- TEST binary-eligible: 568 observations (94.04%)
- Purged: 9 observations
- Outcome tail: 20 future eligible bars

Raw target counts across the complete research population:

`UP=976`, `DOWN=1668`, `TIMEOUT=113`, `AMBIGUOUS=10`.

TEST raw target counts: `UP=162`, `DOWN=406`, `TIMEOUT=28`, `AMBIGUOUS=8`.

## Model and results

- Model: Logistic Regression
- Selected L2: 1
- Validation: Brier 0.277479; log loss 0.750265
- Calibration before: Brier 0.240493; log loss 0.674177
- Calibration after: Brier 0.239162; log loss 0.671315
- Untouched TEST: accuracy 0.714789; Brier 0.216267; log loss 0.624850; ECE 0.112044
- Feature parity: expected 604, checked 604, missing 0, mismatches 0, maximum absolute difference 0
- OOD: 498 in-distribution, 68 warning, 2 out-of-distribution
- Analogue coverage: 100%; mean sample count 50

TEST classification metrics are descriptive only. The model predicted no positive class in this run, so precision, recall, and F1 were 0; the result is not evidence of a profitable strategy.

## Decision funnel and paper replay

- All TEST decisions: 604
- Features available: 604
- Predictions available: 604
- Analogue queried: 604
- Analogue sufficient: 604
- EV evaluated: 604
- Positive EV: 0
- Threshold passed: 0
- BUY decisions: 0
- Main reasons: `ENTRY_THRESHOLD_NOT_MET=528`, `MODEL_OOD_WARNING=74`, `MODEL_OUT_OF_DISTRIBUTION=2`
- Intents: created 0, executed 0, risk-rejected 0, expired 0, cancelled 0
- Orders: 0; fills: 0; closed trades: 0
- Fees: 0; estimated slippage: 0
- Decision-window starting equity: 100,000
- Decision-window ending equity: 100,000; return: 0
- Settled equity: 100,000; settled return: 0
- Maximum drawdown: 0; Sharpe: 0
- Intent lifecycle reconciliation: exact

Benchmarks over the same TEST window:

| Benchmark | Ending equity | Return | Trades | Fees | Slippage |
| --- | ---: | ---: | ---: | ---: | ---: |
| CASH | 100,000.00 | 0.0000% | 0 | 0.00 | 0.00 |
| BUY_AND_HOLD | 98,557.69 | -1.4423% | 1 | 9.92 | 9.92 |
| EMA_BASELINE | 98,350.84 | -1.6492% | 22 | 217.79 | 217.79 |
| LOGISTIC_CANDIDATE | 100,000.00 | 0.0000% | 0 | 0.00 | 0.00 |

Historical readiness is `false` because the existing metric-series gate reported `metricSeriesTrusted=false` (`metricQuality=FAILED`, frequency `1m`, snapshot count 604). All other readiness gates passed, including source provenance, calendar, full-session coverage, gap checks, corporate-action safety, purge isolation, feature parity, and intent lifecycle reconciliation.

Artifact verification: `PASS` (no path, size, or SHA-256 mismatches).

Model lifecycle: `CANDIDATE`.

Sources: [NYSE Holidays & Trading Hours](https://www.nyse.com/trade/hours-calendars) and [State Street SPDR Dividend Distribution Schedule 2026](https://www.ssga.com/library-content/products/fund-data/etfs/us/distribution/SPDR_Dividend_Distribution_Schedule.pdf).
