# Final correctness audit

This audit covers the final implementation pass for the paper-only historical research pipeline.

## Verified

- Calendar configuration is resolved once, canonically hashed, preserved in the frozen runtime, and shared by session validation, scheduling, replay, and resampling.
- Historical provenance is distinct from synthetic fixtures; synthetic readiness is always blocked.
- The full TEST population, including `TIMEOUT` and `AMBIGUOUS`, is retained for replay while only binary-eligible rows train/evaluate the classifier.
- Training and calibration reject single-class samples; TEST single-class results are reported as a warning.
- Active V1 features are OHLCV-only and do not impute absent quote features.
- Entry/exit costs use side-correct executable prices and the same cost API across sizing, replay, and benchmarks.
- Trading-bar target resolution requires explicit schedule/calendar context.
- Delayed execution rechecks risk after the current session mark/baseline update.
- Settlement uses each symbol's latest trusted quote.
- Same-timestamp replay primes all symbols' opening marks before pending risk sizing; new-session baselines are established from opening marks before completed-bar decisions.
- Intent lifecycle identities reconcile exactly, decision-window start equity is captured before TEST fills, and annualisation is centralized.
- Hourly resampling explicitly excludes the incomplete session-close bucket; its policy is recorded in quality metadata.
- Synthetic provenance is derived from manifest source rather than a caller-controlled relabel, and the frozen runtime records settlement and threshold provenance.

## Verification commands

```text
npm ci
npm run typecheck
npm run typecheck:tests
npm test
```

Result: 83 tests passed, 0 failed; both TypeScript checks passed; clean dependency install reported 0 vulnerabilities. GitHub Actions repeats the same checks in `.github/workflows/ci.yml`.

## Remaining limitation

No permitted, user-supplied historical market dataset has been provided or validated in this environment. Synthetic fixtures prove wiring and negative gates only. No first historical pipeline-validation run has been performed, and no live data, daemon, or real-money trading is enabled.

## Verdict

**NOT READY — BLOCKED BY: no user-supplied/licensed/permitted historical market dataset has been validated; no first real historical pipeline-validation run has been performed.**
