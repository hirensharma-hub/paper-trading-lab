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
| No-trade | `no-trade` | Explicit HOLD versus NO_TRADE actions with typed decision reason codes | IMPLEMENTED |
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
| ML dataset/scaler | Leakage-safe prediction research | Train-only standardization, typed wrappers and DatasetObservation V2 integrity validation | IMPLEMENTED |
| Logistic baseline | Supervised classification | Dependency-free binary logistic regression with metadata and metrics | PARTIAL |
| Calibration/OOD | Model diagnostics | Reliability bins, log loss/Brier metrics and simple z-score OOD checks | IMPLEMENTED |
| Historical analogues | Non-parametric context | Nearest-neighbour forward-return/regime/MFE/MAE summary with sample-size evidence | IMPLEMENTED |
| Evidence quality | Research governance | Report-backed weighted score with NOT_TESTED/FAILED/PASSED statuses and provenance | IMPLEMENTED |
| Integrated intelligence | Point-in-time decision pipeline | Shared target registry, frozen target state, model/OOD, normalized target-specific analogues, cost-aware EV and evidence gates | IMPLEMENTED |
| Prediction resolution | Experience research | Delayed forward return, label, MFE and MAE resolution | IMPLEMENTED |
| Model lifecycle | Controlled learning | Candidate/validated/active/retired/rejected registry with evaluation-report promotion gates | PARTIAL |
| Evidence gating | Research governance | Explicit report context; missing reports are NOT_TESTED and weak evidence forces NO_TRADE | IMPLEMENTED |
| Analogue normalization | Similarity research | Required separately named TRAIN-fitted scaler profile with exact schema and target-specific rates | IMPLEMENTED |
| Target registry | Target governance | Versioned target contract for prediction creation and resolution | IMPLEMENTED |
| Prediction queue | Experience research | Pending predictions resolve only when target horizon is available | IMPLEMENTED |
| Model artifact | Reproducibility | Logistic weights bundled with exact named schema, OOD profile, target and dataset-range metadata | IMPLEMENTED |
| Experience persistence | Paper experience | JSONL pending/resolved prediction and model-artifact repositories | PARTIAL |
| Offline experiment pipeline | Permitted offline research | CSV loader, manifest/hash/data-quality gates, point-in-time observations, chronological splits, TRAIN fitting, validation/calibration/TEST diagnostics and synthetic CLI | IMPLEMENTED; historical validation pending permitted data |
| Decision policy | Safe decisioning | Evidence-quality and OOD policy can force NO_TRADE | IMPLEMENTED |
| Local engine service | V1 operations | Localhost HTTP health/state/market-event/control protocol | PARTIAL |
| Stale-data safety | Operational controls | Quote-age guard and stale-symbol health reporting | IMPLEMENTED |
| Historical file provider | Data ingestion | CSV-file provider using canonical validation and quality reporting | IMPLEMENTED |
| Integrated paper engine | Unified execution | Shared analysis, decision, exit, risk, paper broker, owned ledger, prediction queue and event journal path | IMPLEMENTED |
| Provenance guards | Research correctness | Target-end/version, feature schema, chronological split and target resolver checks | IMPLEMENTED |
| Service safety guards | Operational correctness | Origin restriction, payload validation, future/stale quote rejection and explicit no-data state | IMPLEMENTED |
| Trading Mastery | Structured reference | Initial linked entries; broad topic expansion remains | PARTIAL |
