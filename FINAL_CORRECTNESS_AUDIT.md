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

## Verification commands

```text
npm ci
npm run typecheck
npm run typecheck:tests
npm test
```

Result: the full suite and targeted adversarial replay suite pass; both TypeScript checks pass; the clean dependency install and GitHub Actions workflow are required release gates and are rerun for each final push.

## Remaining limitation

No permitted, user-supplied historical market dataset has been provided or validated in this environment. Synthetic fixtures prove wiring and negative gates only, so no historical performance claim is made. The implementation is ready for the first permitted historical pipeline-validation run; no live data, daemon, or real-money trading is enabled.

## Verdict

**READY FOR USER-SUPPLIED PERMITTED HISTORICAL DATA**
