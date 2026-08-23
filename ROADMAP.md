# Roadmap

## Phase 1 — Core correctness

- [x] Multi-symbol histories and per-symbol marks
- [x] Cash, fee, slippage, limit and quote-size fill rules
- [x] Rolling order-rate accounting and explicit risk gates
- [x] Meaningful unit tests and reproducible TypeScript tooling
- [x] Basic metrics, target generation, chronological splits and replay
- [x] Per-symbol risk marks, session calendar, purged split and explicit point-in-time timestamps
- [x] Cash/fee/long-only accounting invariants
- [x] CI typecheck/test workflow
- [x] Durable JSONL/JSON event, experiment and trade persistence abstraction
- [ ] SQLite/IndexedDB persistence adapters

## Phase 2 — Historical research

- [x] Provider-independent historical-data interfaces and CSV quality reports
- [x] CSV-file historical provider adapter
- [ ] JSON/fixture provider parity and corporate-action metadata
- [ ] SQLite ledger and reproducible experiment metadata
- [x] Typed in-memory event, experiment and hypothesis repositories
- [x] Fill-derived closed-trade ledger and replay metrics
- [x] Triple-barrier targets, walk-forward folds and statistical utilities
- [x] Walk-forward and rolling-window split generation
- [ ] Cost stress tests, benchmarks and trade attribution

## Phase 3 — Research features and mastery

- [ ] Modular trend, volatility, volume, structure, pattern and regime engines
- [x] Initial structure, pattern and rule-based regime primitives
- [x] Point-in-time integrated structure/regime/pattern intelligence snapshot
- [x] Feature metadata registry and conditional performance grouping
- [ ] Structured Trading Mastery knowledge base linked to implemented modules

## Phase 4 — Predictive research

- [x] Point-in-time prediction targets and leakage tests beyond the baseline
- [x] Logistic regression baseline, calibration and model metadata
- [x] Historical analogues and evidence-quality scoring
- [x] Prediction resolution with delayed forward outcomes and MFE/MAE
- [x] Candidate/active/rejected model metadata and OOS-gated promotion
- [x] Target registry, prediction queue and preprocessing-aware model artifact bundle
- [x] Durable experience and model-artifact repositories
- [ ] Real licensed dataset training and real validation evidence

## Phase 5 — Robustness and controlled learning

- [ ] Walk-forward model comparison, cost/parameter sensitivity and resampling
- [ ] Experience records, production drift/OOD monitoring and candidate model promotion
- [ ] Persisted walk-forward artifacts, validation-only calibration and reproducible model registry storage
- [ ] Automated promotion report from target-consistent test outcomes

## Phase 6 — Local paper-live workflow

- [x] Local engine HTTP API and safe extension protocol
- [x] Stale-data halt, health endpoint, pause and kill-switch controls
- [ ] Permitted licensed market-data adapter
- [ ] Paper-forward monitoring and dashboard expansion

Real-money execution is out of scope.
