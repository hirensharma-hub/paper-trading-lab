# Research Implementation Tracker

Status reflects implemented, tested behaviour in the repository; it does not imply trading profitability.

| Research concept | Knowledge | Executable implementation | Status |
|---|---|---|---|
| Bid/ask/spread | `bid-ask-spread` | Quote model, spread feature, broker executable pricing | IMPLEMENTED |
| Volatility | `realised-volatility` | Configurable realised volatility feature and metrics | IMPLEMENTED |
| Risk/drawdown | `maximum-drawdown` | Risk limits, high-water mark and metrics | IMPLEMENTED |
| Look-ahead bias | `look-ahead-bias` | Point-in-time feature guard and purged splits | IMPLEMENTED |
| Transaction costs | `transaction-costs` | Fees, spread-side execution, slippage and cash checks | IMPLEMENTED |
| Purging/embargo | `purged-split` | Purged chronological split with embargo bars | IMPLEMENTED |
| No-trade | `no-trade` | HOLD/risk rejection path; structured decision engine remains planned | PARTIAL |
| Market structure | Planned reference expansion | Deterministic swing/range/trend snapshot | PARTIAL |
| Patterns | Planned reference expansion | Initial breakout, deviation and volatility evidence detectors | PARTIAL |
| Regimes | Planned reference expansion | Rule-based trend/volatility classifier | PARTIAL |
| CSV data quality | Data-quality research | Provider-independent CSV importer and quality report | IMPLEMENTED |
| Experiments/hypotheses | Research methodology | Typed metadata and in-memory repositories | PARTIAL |
| Event audit trail | Reproducibility research | Append-only in-memory event repository | PARTIAL |
| Closed trades | Execution research | Fill-derived ledger with fees, holding time and MFE/MAE | IMPLEMENTED |
| Triple barriers | Prediction targets | UP/DOWN/TIMEOUT/AMBIGUOUS target generator | IMPLEMENTED |
| Walk-forward validation | Time-series validation | Reusable fold generator with embargo/horizon gaps | IMPLEMENTED |
| Statistical toolkit | Probability/statistics | Mean, variance, quantiles, correlation, CI and EV | IMPLEMENTED |
| Durable persistence | Reproducibility research | JSONL/JSON restart-safe event, experiment and trade repositories | PARTIAL |
| Feature registry | Reproducibility research | Versioned metadata for baseline features | IMPLEMENTED |
| Regime/pattern reporting | Conditional analysis | Grouped trade metrics by labels | PARTIAL |
| Machine learning | ML research | Targets/splits only; no active trained model yet | PLANNED |
| Trading Mastery | Structured reference | Initial linked entries; broad topic expansion remains | PARTIAL |
