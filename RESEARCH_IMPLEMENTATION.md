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
| ML dataset/scaler | Leakage-safe prediction research | Train-only standardization and split-preserving prepared rows | PARTIAL |
| Logistic baseline | Supervised classification | Dependency-free binary logistic regression with metadata and metrics | PARTIAL |
| Calibration/OOD | Model diagnostics | Reliability bins, log loss/Brier metrics and simple z-score OOD checks | IMPLEMENTED |
| Historical analogues | Non-parametric context | Nearest-neighbour forward-return/regime/MFE/MAE summary with sample-size evidence | IMPLEMENTED |
| Evidence quality | Research governance | Transparent weighted score across sample size, OOS, calibration, costs and stability | IMPLEMENTED |
| Integrated intelligence | Point-in-time decision pipeline | Features, confirmed structure, regimes, patterns, model/OOD, analogues, EV and evidence gates | PARTIAL |
| Prediction resolution | Experience research | Delayed forward return, label, MFE and MAE resolution | IMPLEMENTED |
| Model lifecycle | Controlled learning | Candidate/active/rejected registry with OOS threshold promotion | PARTIAL |
| Evidence gating | Research governance | Explicit validation/calibration/cost/stability inputs; weak evidence forces NO_TRADE | IMPLEMENTED |
| Analogue normalization | Similarity research | Optional train-fitted scaler and as-of/regime filtering before nearest-neighbour ranking | PARTIAL |
| Target registry | Target governance | Versioned target contract for prediction creation and resolution | IMPLEMENTED |
| Prediction queue | Experience research | Pending predictions resolve only when target horizon is available | IMPLEMENTED |
| Model artifact | Reproducibility | Logistic weights bundled with scaler, feature version and target version | PARTIAL |
| Experience persistence | Paper experience | JSONL pending/resolved prediction and model-artifact repositories | PARTIAL |
| Decision policy | Safe decisioning | Evidence-quality and OOD policy can force NO_TRADE | IMPLEMENTED |
| Trading Mastery | Structured reference | Initial linked entries; broad topic expansion remains | PARTIAL |
