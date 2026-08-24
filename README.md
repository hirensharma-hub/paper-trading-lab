# Paper Trading Lab

V1 foundation for a quantitative research and paper-trading platform. The trading decision path is deterministic code: market data → features → strategy → risk → internal paper broker. There is no LLM or generative model in the execution path, and no live-money adapter.

## Scope and safety boundary

- US equities/ETFs, completed-bar research, top-of-book-aware fills.
- TradingView is a display-only visual workspace. The extension must not scrape its DOM, consume its prices, click its order controls, or turn its alerts into automated orders.
- The engine is intended to run outside Chrome; the extension is only an overlay/controller.
- Market-data licensing must be verified for the selected provider and non-display internal use before connecting a live feed.
- This repository does not claim profitability or suitability for real trading.

## Structure

`src/domain.ts` contains canonical bars, quotes, features, orders and fills. `src/features.ts` implements auditable price/volume features. `src/strategy.ts` provides a deterministic EMA baseline. `src/risk.ts` applies position, exposure, loss, drawdown, rate and kill-switch controls. `src/broker.ts` simulates executable bid/ask fills, configurable slippage and fees, and reconstructable positions. `src/engine.ts` composes the event path.

`extension/` contains a loadable Manifest V3 demo. It has a popup dashboard and a display-only overlay for TradingView. The demo state is stored in extension storage and is not connected to market data or a broker. The overlay never reads chart values or clicks TradingView controls.

## Development

From this directory:

```bash
npm install
npm run typecheck
npm run typecheck:tests
npm test
```

The test suite is intentionally focused on correctness: known indicator values, invalid data, cash and quote-size constraints, limit semantics, risk gates, fee reconciliation, purged target timing, metrics and multi-symbol accounting.

The research core also exposes provider-independent file/in-memory market-data interfaces, a CSV OHLCV importer with a quality report, a timezone-aware regular-session calendar, a small linked Trading Mastery knowledge base, and a deterministic predictive-research baseline. The ML utilities fit preprocessing only on training rows and provide a simple logistic classifier, calibration/OOD diagnostics, historical analogues and evidence scoring; they require a real licensed dataset and further validation before any paper-forward use.

Replay reconstructs closed trades from broker fills and reports equity snapshots, fees, net P/L, holding periods and MFE/MAE. Research utilities include triple-barrier targets, purged/walk-forward splits, descriptive statistics and expected value.

The persistence layer currently provides restart-safe JSONL/JSON repositories for the event journal, experiments and closed trades. This keeps the domain independent from a database driver; SQLite and browser IndexedDB adapters remain planned.

`src/intelligence.ts` composes the point-in-time research signals into an explainable snapshot and can return `BUY`, `HOLD` or `NO_TRADE`; it does not submit orders. `src/experience.ts` resolves predictions only after their horizon has elapsed, and `src/model-registry.ts` requires an out-of-sample score threshold before a candidate can become active. These are research controls, not claims of predictive performance.

Analogue lookup can be constrained by decision time and regime and can use the same train-fitted scaler as a model artifact. Evidence fields are never inferred: without explicit out-of-sample, calibration, cost and stability evidence, the intelligence layer will not issue a BUY. Target versions, pending predictions, resolved experience and model artifacts can be stored as JSONL for reproducible offline research.

The correctness contract is strict: analogue observations must carry usable decision and target-end timestamps when queried as-of a decision; models fit only `TRAIN` rows; feature and target versions must match; stale or future market events are rejected before state mutation; OOD states are blocked by decision policy; and the local API does not use wildcard CORS or accept unvalidated event payloads. The integrated engine uses an exhaustive action mapping (`BUY` submits only a buy, `SELL` only reduces an existing long, and `HOLD`/`NO_TRADE` submit nothing), marks all symbols before risk checks, resets daily-risk state by the configured trading session, and preserves triple-barrier `AMBIGUOUS` outcomes. A model-side feature transform and an analogue scaler cannot both be configured, preventing silent double preprocessing.

## Run the local paper engine

Start the authoritative local process with:

```bash
npm install
npm run service
```

It listens only on `127.0.0.1:47821` and accepts normalized paper-market events at `/market-event`. The service uses the integrated intelligence/decision/risk/broker path; with no validated model artifact or evidence configured, its safe default is `NO_TRADE`. The extension checks `/state` and uses the service’s health, pause and resume controls when the service is available; otherwise it stays in its clearly marked offline demo mode. No external market-data credentials or broker adapters are included.

For an unpacked extension, configure its exact origin before starting the service: `PAPER_EXTENSION_ORIGIN=chrome-extension://<extension-id> npm run service`. Origins are never trusted merely because they use the `chrome-extension:` scheme; requests without an Origin header remain available for local CLI/test use.

## Try the Chrome extension

1. Download the repository from GitHub or clone it temporarily.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `extension/` folder.
3. Open any `tradingview.com` chart. The overlay appears in the top-right corner.
4. Click the extension icon for the popup dashboard. Use **Pause engine** and **Reset demo** to test the controls.

This is an intentionally safe demo UI. It does not consume TradingView prices, submit orders, or represent live performance. The next integration step is connecting the overlay to the separately running local TypeScript engine API.

See [PROJECT_STATE.md](PROJECT_STATE.md) for the current implementation boundary and [ROADMAP.md](ROADMAP.md) for planned research phases.

See [RESEARCH_IMPLEMENTATION.md](RESEARCH_IMPLEMENTATION.md) for a topic-by-topic mapping from the research specification to executable code and remaining work.

## Offline experiments

`npm run experiment -- --synthetic` runs a deterministic end-to-end synthetic pipeline: point-in-time observations, triple-barrier labels, chronological splits, purge validation, TRAIN-only scaling and analogue fitting, logistic training, validation selection, calibration, untouched TEST metrics, and a candidate artifact manifest. Synthetic output is explicitly not historical market evidence.

With a permitted CSV and JSON configuration containing `manifest` and experiment fields, run `npm run experiment -- --data ./data/sample.csv --config ./experiments/config.json --output ./artifacts/experiment-001`. The runner is paper-only and never places live orders. The output includes the strict model artifact, TRAIN analogue scaler, calibration/OOD/test diagnostics, honest research-report statuses, replay/benchmark reports, and a hash manifest. OOS, cost-stress, walk-forward and stability evidence is never marked passed without a genuine corresponding test.

The ExperimentRunner treats the decision-time split as authoritative: TRAIN, validation, calibration and TEST ranges are explicit, boundary-aware purge uses the configured validation/calibration/test starts, and TEST rows are untouched by fitting or calibration. The immutable first target is `triple-barrier-next-open-20-u1.5-d1-v1` with `TRADING_BARS` horizon and `NEXT_BAR_OPEN` entry semantics. A timezone-aware `ExpectedBarClock` carries horizons across session closes, weekends and holidays. Prediction and resolution records retain the target and entry method, while replay stores delayed intents and performs the opening-price risk check only when the next bar actually opens.

The persisted experiment includes the complete analogue database (UP, DOWN, TIMEOUT and AMBIGUOUS), TRAIN-only analogue pool/scaler, exact model artifact with partition and fit ranges, actual final-row ranges, cost model, pre-test evidence context, decision/exit/risk/broker/calendar configuration, metric frequency, regime-evidence setting and gap policy. Current TEST/OOS evidence is generated with an explicit post-test availability timestamp and is never placed in the runtime evidence context. Excluded labels never receive a fabricated binary label. Replays report separate decision and outcome windows, warmup/test counts, pending/cancelled intents, execution-time risk resizes/rejections, actual Intelligence EV estimates, reason-code counts, order counts, fees, estimated slippage, action counts and metric quality; benchmarks use the same TEST interval and paper-cost path for the candidate, equal-weight buy-and-hold and EMA baseline. Synthetic mode is explicitly labelled as an unsafe synthetic-gates bypass and is never accepted as historical evidence. A candidate is never auto-promoted.

Historical output includes `historicalReadiness`. `readyForInterpretation` is false until manifest provenance, full-session coverage, gap/corporate-action safety, explicit split windows, purge and fit isolation, temporal evidence safety, trading-bar target semantics, execution-policy compatibility, delayed-execution risk rechecks, cost consistency, common decision windows and trusted metric series all pass. Until a permitted historical dataset passes those gates, the repository remains in offline synthetic-smoke mode and no live provider, money or TradingView automation is enabled.

## Research discipline

Every experiment should record dataset version, point-in-time feature policy, strategy/version, cost model, parameters, random seed, in-sample/validation/out-of-sample ranges and all tested configurations. A candidate model may only replace an active model after time-ordered validation and forward paper evidence show a robust improvement after costs.
