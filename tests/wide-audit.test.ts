import test from "node:test";
import assert from "node:assert/strict";
import { ExperimentRunner } from "../src/experiment";
import { TargetRegistry } from "../src/targets";
import { exchangeCalendarSpec } from "../src/calendar";

test("trusted target registration fails closed for unimplemented wall-clock horizons", () => {
  const registry = new TargetRegistry();
  assert.throws(() => registry.register({ targetVersion: "wall-clock", kind: "FORWARD_CLOSE_RETURN", horizonBars: 1, timeBasis: "WALL_CLOCK" }), /WALL_CLOCK/);
});

test("synthetic evidence cannot silently become historical readiness", () => {
  const report = new ExperimentRunner().syntheticSmoke();
  assert.equal(report.historicalReadiness?.readyForInterpretation, false);
  assert.equal(report.historicalReadiness?.checkDetails.length, Object.keys(report.historicalReadiness?.checks ?? {}).length);
  assert.ok(report.historicalReadiness?.checkDetails.every((check) => check.code && check.detail && "observed" in check && "expected" in check));
  assert.equal(report.historicalReadiness?.checks.manifestProvenance, false);
});

test("calibration evidence availability follows label knowledge", () => {
  const report = new ExperimentRunner().syntheticSmoke();
  const calibration = report.researchReports?.calibration;
  assert.ok(calibration?.generatedAt !== undefined && calibration.availableAtTimestamp !== undefined);
  assert.equal(calibration?.generatedAt, calibration?.availableAtTimestamp);
});

test("calendar provenance is versioned and deterministic", () => {
  const first = exchangeCalendarSpec({ timeZone: "America/New_York" });
  const second = exchangeCalendarSpec({ timeZone: "America/New_York" });
  assert.equal(first.version, "exchange-calendar-spec-v2");
  assert.deepEqual(first, second);
});
