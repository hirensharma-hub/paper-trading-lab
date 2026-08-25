# Final correctness audit

This audit covers the final implementation pass for the paper-only historical research pipeline.

## Verified

- Calendar configuration is resolved once, canonically hashed, preserved in the frozen runtime, and shared by session validation, scheduling, replay, and resampling.
- Historical provenance is explicit: only `EXTERNAL_HISTORICAL_FILE` can produce historical readiness, while `SYNTHETIC_FIXTURE` is always blocked regardless of source text.
- The full TEST population, including `TIMEOUT` and `AMBIGUOUS`, is retained for replay while only binary-eligible rows train/evaluate the classifier.
- Training and calibration reject single-class samples; TEST single-class results are reported as a warning.
- Active baseline-ohlcv-v2 features are OHLCV-only and do not impute absent quote features.
- Entry/exit costs use side-correct executable prices and the same cost API across sizing, replay, and benchmarks.
- Trading-bar target resolution requires explicit schedule/calendar context.
- Delayed execution rechecks risk after the current session mark/baseline update.
- Settlement uses each symbol's latest trusted quote.
- Same-timestamp replay sorts and batches all symbols atomically: opening marks, session baselines, pending next-open execution, completed-bar state, decisions, and one portfolio snapshot per timestamp are deterministic and permutation-tested.
- Intent lifecycle identities reconcile exactly, decision-window start equity is captured before TEST fills, and annualisation is centralized.
- Hourly resampling explicitly excludes the incomplete session-close bucket; its policy is recorded in quality metadata.
- The frozen runtime records explicit origin, canonical dataset/calendar hashes, settlement and threshold provenance, and the full artifact manifest records paths, schemas, sizes, and hashes.
- `src/historical-preflight.ts` is the authoritative dataset/manifest preflight used by `validate-data`, `validateManifest`, and `ExperimentRunner`; its machine-readable checks cover origin, permission, hashes, calendar, quality, session coverage, corporate actions, feature, target, and label versions.
- `splits:suggest` uses `TradingCalendar.sessionKey()` boundaries and reserves a 20-eligible-bar outcome tail; insufficient session counts fail with a dataset-size error.
- Runtime feature parity is measured against TEST observations and recorded as checked count, mismatch count, IDs, maximum absolute difference, feature version, and feature IDs.
- The optional Twelve Data adapter is read-only, uses `TWELVE_DATA_API_KEY` from the environment, chunks/retries requests, normalizes/deduplicates/sorts OHLCV, and writes a provenance sidecar without permission claims or secrets.
- Artifact output includes the required preflight, eligibility, split/purge, prediction/experience, intent/execution, order/fill/trade, settlement, benchmark, readiness, and reproducibility files; every artifact entry is verified for existence, size, and SHA-256 before completion.

## Verification commands

```text
npm ci
npm run typecheck
npm run typecheck:tests
npm test
```

Result: 96 tests passed, 0 failed; both TypeScript checks pass; the clean dependency install, smoke CLI, full temporary fixture workflow, and GitHub Actions workflow pass. The temporary fixture is explicitly synthetic and its historical readiness is false.

## Remaining limitation

No permitted, user-supplied historical market dataset has been provided or validated in this environment. Synthetic fixtures prove wiring and negative gates only, so no historical performance claim is made. The implementation is ready for the first permitted historical pipeline-validation run; no live data, daemon, or real-money trading is enabled.

## Verdict

**READY FOR FIRST PERMITTED HISTORICAL PAPER-RESEARCH EXPERIMENT**
