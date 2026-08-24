import test from "node:test";
import assert from "node:assert/strict";
import { resampleEquityCurve, performanceMetrics } from "../src/metrics";

test("equity resampling uses the last portfolio value in each bucket", () => { const curve = resampleEquityCurve([{ ts: 1, value: 100 }, { ts: 2, value: 110 }, { ts: 61_000, value: 105 }], "1m"); assert.equal(curve[0].value, 110); assert.equal(performanceMetrics(curve).maxDrawdownDurationMs >= 0, true); });
