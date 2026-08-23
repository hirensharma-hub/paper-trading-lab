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

`extension/` is a Manifest V3 shell only; the UI files are intentionally not generated until the engine API contract and security review are complete.

## Development

From this directory:

```bash
npm run typecheck
npm test
```

The current root repository has unrelated work and an origin for a different application. Keep this directory isolated until a dedicated GitHub repository URL is supplied. Recommended next step:

```bash
git init
git add .
git commit -m "Build paper trading research foundation"
git remote add origin <dedicated-github-repository-url>
git push -u origin main
```

## Research discipline

Every experiment should record dataset version, point-in-time feature policy, strategy/version, cost model, parameters, random seed, in-sample/validation/out-of-sample ranges and all tested configurations. A candidate model may only replace an active model after time-ordered validation and forward paper evidence show a robust improvement after costs.
