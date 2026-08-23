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
npm test
```

The test suite is intentionally focused on correctness: known indicator values, invalid data, cash and quote-size constraints, limit semantics, risk gates, fee reconciliation, purged target timing, metrics and multi-symbol accounting.

The research core also exposes provider-independent file/in-memory market-data interfaces, a CSV OHLCV importer with a quality report, a timezone-aware regular-session calendar, and a small linked Trading Mastery knowledge base.

## Try the Chrome extension

1. Download the repository from GitHub or clone it temporarily.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `extension/` folder.
3. Open any `tradingview.com` chart. The overlay appears in the top-right corner.
4. Click the extension icon for the popup dashboard. Use **Pause engine** and **Reset demo** to test the controls.

This is an intentionally safe demo UI. It does not consume TradingView prices, submit orders, or represent live performance. The next integration step is connecting the overlay to the separately running local TypeScript engine API.

See [PROJECT_STATE.md](PROJECT_STATE.md) for the current implementation boundary and [ROADMAP.md](ROADMAP.md) for planned research phases.

## Research discipline

Every experiment should record dataset version, point-in-time feature policy, strategy/version, cost model, parameters, random seed, in-sample/validation/out-of-sample ranges and all tested configurations. A candidate model may only replace an active model after time-ordered validation and forward paper evidence show a robust improvement after costs.
