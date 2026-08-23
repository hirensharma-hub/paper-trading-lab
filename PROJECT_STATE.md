# Project State

Updated: 2026-08-23

## Current phase

Phase 1 — core correctness and reproducible research foundation, with the first data/research utilities.

## Architecture

- `src/domain.ts`: canonical bars, quotes, features, orders, fills and portfolio snapshots.
- `src/data.ts`: OHLC/quote validation and symbol-specific monotonic bar storage.
- `src/calendar.ts`: timezone-aware US-equity regular-session boundaries using `Intl` DST rules.
- `src/features.ts`: EMA, RSI, returns, configurable realised volatility, volume z-score, spread and book imbalance.
- `src/strategy.ts`: deterministic long-only EMA baseline. It emits no arbitrary probability/confidence.
- `src/risk.ts`: exposure, daily loss, drawdown, rate and kill-switch checks.
- `src/broker.ts`: simulation-only market/limit execution, bid/ask pricing, quote-size partial fills, fees, slippage, cash constraints and position accounting.
- `src/engine.ts`: multi-symbol event flow with independent histories, marks, session equity and rolling order timestamps.
- `src/metrics.ts`: return, volatility, Sharpe/Sortino-style ratios, drawdown, expectancy, win rate and profit factor.
- `src/research.ts`: forward-return targets and chronological train/validation/test splits.
- `src/market-data.ts`: provider interfaces, in-memory provider, CSV OHLCV parser and quality report.
- `src/knowledge/index.ts`: paraphrased, linked Trading Mastery reference entries.
- `src/backtest.ts`: deterministic replay using the same engine and broker interfaces.
- `extension/`: lightweight MV3 display-only demo popup/overlay. It does not scrape TradingView or submit orders.

## Completed in this stage

- Replaced the placeholder test with meaningful unit tests covering indicators, data validation, broker semantics, risk limits, metrics, leakage-safe targets, and multi-symbol engine state.
- Fixed multi-symbol gross exposure to use per-symbol marks and reject missing marks.
- Corrected Sharpe/Sortino annualisation, CAGR, Calmar and drawdown duration calculations.
- Added purged chronological splits and explicit feature/decision/target timestamps.
- Enforced long-only selling, affordability after slippage/fees, cumulative fee accounting and session-aware daily-risk resets.
- Added provider-independent CSV import and initial structured knowledge entries linked to code modules.
- Removed the hard-coded one-minute volatility annualisation assumption.
- Removed the invented strategy confidence value.
- Added reproducible TypeScript tooling declarations.
- Added project-state and phased roadmap documentation.

## Known limitations

- No licensed market-data adapter or local HTTP engine service exists yet; the current provider is file/in-memory only.
- SQLite/IndexedDB persistence, append-only event audit storage and a full UI/API contract remain future work.
- Stop orders, cancellation, richer partial-fill queue models and shorting/leverage are not implemented.
- Backtest replay currently requires normalized bar+quote events and exposes basic equity only.
- No ML model is active; this is intentional until the research/backtest foundation is independently validated.
- TypeScript tests require `npm install` before `npm run typecheck` or `npm test`.

## Safety status

Paper trading only. There is no real-money broker adapter. TradingView remains display-only and is not a market-data source.
