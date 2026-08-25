# Project State

The offline ExperimentRunner V2 and CLI execute a real deterministic pipeline for permitted CSV input and synthetic data, including data/hash/full-session gates, point-in-time labels with trading-bar planned versus outcome-availability timestamps, explicit decision/outcome windows, configured-boundary purge, TRAIN-only fitting and calibration, untouched TEST metrics, post-test evidence availability, persisted fit ranges, frozen-runtime identity, delayed-intent paper replay, cost-aware benchmarks and candidate-only lifecycle. Historical validation remains pending permitted data.

Updated: 2026-08-25

## Current phase

Phase 5 — target-consistent predictive research and controlled experience; no production model is active.

## Architecture

- `src/domain.ts`: canonical bars, quotes, features, orders, fills and portfolio snapshots.
- `src/data.ts`: OHLC/quote validation and symbol-specific monotonic bar storage.
- `src/calendar.ts`: timezone-aware US-equity regular-session boundaries using `Intl` DST rules.
- `src/features.ts`: EMA, RSI, returns, configurable realised volatility, volume z-score, spread and book imbalance.
- `src/strategy.ts`: deterministic long-only EMA baseline. It emits no arbitrary probability/confidence.
- `src/risk.ts`: exposure, daily loss, drawdown, rate and kill-switch checks.
- `src/broker.ts`: simulation-only market/limit execution, bid/ask pricing, quote-size partial fills, fees, slippage, cash constraints and position accounting.
- `src/engine.ts`: multi-symbol event flow with independent histories, marks, session equity and rolling order timestamps.
- `src/metrics.ts`: explicit equity resampling, return metrics, time drawdown duration, expectancy, win rate and profit factor; conditional trade statistics do not manufacture portfolio annualisation.
- `src/research.ts`: forward-return targets and chronological train/validation/test splits.
- `src/market-data.ts`: provider interfaces, in-memory provider, CSV OHLCV parser and quality report.
- `src/local-service.ts`: localhost-only HTTP protocol for paper engine health, state, market events and safe controls.
- `src/service-main.ts`: runnable paper-only local engine process using the integrated research path.
- `src/integrated-engine.ts`: shared intelligence → decision → risk → paper-broker flow and deterministic integrated replay.
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
- `src/intelligence.ts`: point-in-time analysis snapshot only; final action is owned by `DecisionEngine`.
- `src/experience.ts`: resolver-registry-backed delayed prediction resolution with post-decision next-bar-open entry and immutable target versions.
- `src/bar-schedule.ts`: expected trading-bar clock across regular-session closes, weekends and holidays.
- `src/execution-policy.ts`: explicit entry/exit execution methods and runtime modes.
- `src/model-registry.ts`: candidate/validated/active/retired/rejected lifecycle with report-backed promotion gates.
- `src/targets.ts`: immutable target definitions and resolver contracts.
- `src/decision.ts` / `src/exit-policy.ts`: typed reason codes, explicit position context, deterministic entry/hold/exit policy.
- `src/feature-schema.ts` / `src/ml-contracts.ts`: named feature IDs and independent model preprocessing contracts.
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
- Corrected trend-regime sign, prior-range breakout and failed-breakout logic, pivot confirmation timestamps, entry-bar MFE/MAE contamination, elapsed-time metric annualisation, quote-last validation, slippage-aware risk sizing and conditional return methodology.
- Added the integrated point-in-time intelligence snapshot, structured BUY/HOLD/NO_TRADE decisions, prediction resolution and an OOS-gated model registry.
- Removed fabricated intelligence evidence assumptions; validation, calibration, cost survival and stability are now explicit inputs and weak evidence cannot produce a BUY.
- Added time-safe analogue filtering, optional train-fitted feature scaling, regime-matched analogue evidence and decision-time timestamps.
- Made prediction resolution target-consistent with the forward-close target, added a prediction queue, target registry and preprocessing-aware logistic model artifact bundle.
- Added durable JSONL repositories for pending predictions, resolved experience records and model artifacts, plus an explicit decision policy and promotion report.
- Added stale-quote protection, operational health state, explicit pause versus kill-switch controls and a localhost paper-engine HTTP service.
- Added a strict frozen ExperimentRunner runtime manifest, complete outcome-preserving analogue persistence, actual test analogue coverage and expected-value audit fields, side-specific execution costs, observed-spread provenance, warmup/test order accounting, and deterministic synthetic BUY/SELL smoke coverage.
- Added CSV-file historical provider support and connected the extension to the local service when available, with an offline demo fallback.
- Added critical provenance/schema/timing guards: analogue target-end and target-version filtering, train-only model fitting, chronological dataset splits, target resolver dispatch including triple barriers, cost-aware EV, strict OOD decision handling, and timestamp-aware conditional metrics.
- Added the integrated paper research engine and replay path; the runnable local service now uses it and safely produces `NO_TRADE` until a validated model/evidence artifact is configured.
- Audited and fixed the latest service/research defects: stale events no longer mutate history/marks, no-quote health is not fresh, future quotes are rejected, order timestamps use decision time, CORS is origin-restricted, the manifest port matches the service, extension connectivity does not stay cached as healthy, and market-event payloads are validated.
- Preserved HOLD as a valid action, added explicit exits, RTH-only new-risk gating, kill-switch reduction semantics, post-decision target entry, immutable target versions, failed-breakout current-bar checks, named feature/model contracts, report/calibration primitives, integrated ledger ownership, prediction/experience lifecycle, deterministic event journaling, service protocol metadata, and explicit extension statuses.
- Finalized the experiment-runtime audit: frozen replay now carries calendar and regime-evidence settings, TEST replay stops at the configured test end, benchmarks use the same TEST interval and `PaperBroker` cost path for multiple symbols, report ranges are derived from final rows, empty calibration bins remain null, and deterministic `ManualClock` support is available for registry tests.
- Corrected session resampling so warmup-suppressed observations do not create false pre-window gaps while missing buckets inside the observed session window still fail the metric-quality gate; the expanded regression suite now covers the exact split, target-entry, analogue, benchmark, runtime, clock and replay contracts.
- Completed the temporal/execution fidelity pass: current OOS evidence is post-test and excluded from the pre-test runtime context; evidence availability is checked against the decision timestamp; horizons use eligible trading bars; purge uses explicit configured boundaries; split/replay/journal ordering uses quote-aware decision timestamps; delayed next-open intents are risk-sized at the actual opening quote; opening spread is applied once before broker slippage/fees; entry and exit methods are independent; actual broker submission drives order-rate accounting; pending end-of-test intents are cancelled and reported; and the replay exposes outcome tails, execution-time risk outcomes, actual Intelligence EV and reason-code counts.
- Added `HistoricalReadinessReport` with explicit full-session, gap, corporate-action, split, purge, scaler/calibration isolation, temporal-evidence, target, execution, cost and metric-quality gates. It remains false for synthetic smoke output and until a permitted historical dataset is actually validated.
- Wide adversarial audit fixes: deferred next-open signals now journal `EXECUTION_INTENT_CREATED` and emit `RISK_APPROVED` only after execution-time risk sizing; unsupported `WALL_CLOCK` targets fail closed; calendar specifications carry a deterministic version/hash in frozen runtime metadata; and readiness checks now expose structured code/detail/observed/expected evidence instead of tautological booleans.
- Final historical handoff pass: `src/historical-preflight.ts` is shared by CLI and ExperimentRunner; manifest initialization generates canonical/calendar provenance; session-aligned split suggestion reserves the outcome tail; measured TEST feature parity is persisted; optional Twelve Data acquisition is read-only and secret-safe; artifact manifests are cryptographically verified; and the complete temporary CLI workflow is covered by regression tests.

## Known limitations

- No live market feed exists and no real-time acquisition is implemented. The optional Twelve Data module is historical-data-only, separate from the local paper service and broker.
- SQLite/IndexedDB persistence and a fuller UI/API contract remain future work; the current durable store is a deliberately dependency-light JSONL/JSON implementation and the local API is intentionally small.
- Stop orders, cancellation, richer partial-fill queue models and shorting/leverage are not implemented.
- Backtest replay requires normalized bar+quote events and now exposes snapshots, closed trades and metrics; durable persistence remains planned.
- The ML implementation is a tested research baseline; it has not been trained on a licensed historical dataset or connected to a paper-forward execution policy. JSONL artifact persistence and frozen replay metadata are available, but no real candidate model has been promoted.
- Calibration and OOD checks are diagnostic utilities, not guarantees of probability accuracy or regime stability.
- The integrated local process currently has no licensed market feed and no validated model artifact configured by default; accepting an event successfully does not imply a trade will be taken.
- Historical `readyForInterpretation` is intentionally false until a permitted dataset passes the complete readiness report; synthetic bypasses are explicitly named and cannot be used to claim historical evidence.
- No licensed provider, neural network, tree model, or real historical experiment is enabled; those remain blocked until the correctness contracts have real data-backed validation.
- Market structure, pattern, regime, event and experiment modules are initial primitives, not a complete platform.
- TypeScript tests require `npm install` before `npm run typecheck` or `npm test`.

## Safety status

Paper trading only. There is no real-money broker adapter. TradingView remains display-only and is not a market-data source.

## Final correctness-pass status

- Target kind is derived from the injected TargetRegistry; unregistered targets and unavailable target state block new predictions/trades.
- Triple-barrier ATR14 state is calculated from completed bars and frozen in PredictionRecord for later resolution.
- Trusted analogues require a separately named TRAIN-fitted scaler profile and expose target-specific return/barrier rates.
- ExecutionCostModel is active in intelligence EV and exposes separate entry/exit slippage plus currency and return units.
- Evidence is report-backed with explicit NOT_TESTED/FAILED/PASSED statuses and provenance; caller booleans are not part of the trusted IntelligenceConfig.
- Metric risk annualisation uses the declared sampling frequency; CAGR alone uses elapsed wall-clock time.
- DatasetObservation V2 and integrity validation require point-in-time/provenance fields.
- `npm run typecheck:tests` covers every `tests/**/*.test.ts` file in CI; the fixtures use the current strict decision, evidence, label-policy and model contracts.

The first historical pipeline-validation experiment is not claimed or auto-run in this pass because no permitted local historical dataset manifest/data fixture is present. No profitability or edge claim is made.
