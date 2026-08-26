# Candidate V2B — Controlled Causal Feature Expansion

Development-only comparison of `baseline-ohlcv-v2` and `candidate-ohlcv-v3` using four chronological expanding folds. The final holdout remains locked and was not evaluated.

## Result

{"baselineMeanBrier":0.23538861297913802,"baselineMeanLogLoss":0.6636966741318739,"baselineMeanRoc":0.5080744761691732,"candidateBuyDecisions":0,"candidateMeanBrier":0.23539669856199763,"candidateMeanLogLoss":0.6637212012720868,"candidateMeanRoc":0.5094817165666264,"candidatePositiveEvCount":1032,"candidateTrades":0,"comparableObservationCount":8800,"finalHoldoutStatus":"LOCKED","foldWins":2,"protocolId":"candidate-v2b-causal-ohlcv-v3","selectionGate":"FAIL"}

Selection is mechanically determined by `candidate-v2b-decision.json`. Raw market data and credentials are intentionally excluded.
