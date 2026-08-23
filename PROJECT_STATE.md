# Project State

Updated: 2026-08-23

## Current phase

Phase 4 — predictive research scaffolding; the ML layer is deterministic and tested on synthetic inputs, but no production model is active.

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
- `src/structure.ts`: deterministic swing, range and higher-high/lower-low structure.
- `src/regime.ts`: rule-based trend and volatility regime classifier.
- `src/patterns.ts`: measurable breakout, deviation and volatility evidence patterns.
- `src/research-ledger.ts`: append-only event repository plus experiment/hypothesis records.
- `src/trades.ts`: fill-derived long-only closed-trade ledger with fee allocation and MFE/MAE.
- `src/statistics.ts`: descriptive statistics, correlation, confidence interval and expected-value utilities.
- `src/persistence.ts`: durable JSONL/JSON repositories for events, experiments and closed trades.
- `src/feature-registry.ts`: versioned metadata for implemented baseline features.
- `src/conditional.ts`: performance grouping by regime/pattern/model labels.
- `src/ml.ts`: train-only standardization, logistic baseline, classification/calibration metrics and simple OOD diagnostics.
- `src/analogues.ts`: nearest historical analogue summaries with sample-size/evidence labels.
- `src/evidence.ts`: transparent evidence-quality scoring for research claims.
- `src/backtest.ts`: deterministic replay using the same engine and broker interfaces.
- `extension/`: lightweight MV3 display-only demo popup/overlay. It does not scrape TradingView or submit orders.

## Completed in this stage

- Replaced the placeholder test with meaningful unit tests covering indicators, data validation, broker semantics, risk limits, metrics, leakage-safe targets, and multi-symbol engine state.
- Fixed multi-symbol gross exposure to use per-symbol marks and reject missing marks.
- Corrected Sharpe/Sortino annualisation, CAGR, Calmar and drawdown duration calculations.
- Added purged chronological splits and explicit feature/decision/target timestamps.
- Enforced long-only selling, affordability after slippage/fees, cumulative fee accounting and session-aware daily-risk resets.
- Added provider-independent CSV import and initial structured knowledge entries linked to code modules.
- Added per-symbol final-position caps and risk-reducing exits above exposure caps.
- Corrected market-order affordability to use slipped fill prices plus fees.
- Added broker entry-fee allocation for net realized P/L.
- Added holiday/early-close provider hooks and CI verification workflow.
- Upgraded replay to produce portfolio snapshots, closed trades and performance metrics.
- Added triple-barrier targets, ambiguity handling and walk-forward split generation.
- Added restart-safe file-backed event, experiment and trade repositories.
- Added feature metadata registry and conditional performance reporting.
- Removed the hard-coded one-minute volatility annualisation assumption.
- Removed the invented strategy confidence value.
- Added reproducible TypeScript tooling declarations.
- Added project-state and phased roadmap documentation.
- Added leakage-safe ML dataset preparation, a dependency-free logistic baseline, calibration bins, OOD checks, historical analogue summaries and evidence-quality scoring.

## Known limitations

- No licensed market-data adapter or local HTTP engine service exists yet; the current provider is file/in-memory only.
- SQLite/IndexedDB persistence and a full UI/API contract remain future work; the current durable store is a deliberately dependency-light JSONL/JSON implementation.
- Stop orders, cancellation, richer partial-fill queue models and shorting/leverage are not implemented.
- Backtest replay requires normalized bar+quote events and now exposes snapshots, closed trades and metrics; durable persistence remains planned.
- The ML implementation is a tested research baseline; it has not been trained on a licensed historical dataset, persisted in a model registry, drift-monitored or promoted for paper-forward use.
- Calibration and OOD checks are diagnostic utilities, not guarantees of probability accuracy or regime stability.
- Market structure, pattern, regime, event and experiment modules are initial primitives, not a complete platform.
- TypeScript tests require `npm install` before `npm run typecheck` or `npm test`.

## Safety status

Paper trading only. There is no real-money broker adapter. TradingView remains display-only and is not a market-data source.
