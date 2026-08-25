import type { Bar } from "./domain";
import { canonicalDatasetHash, BAR_CANONICALIZATION_VERSION, validateBar, type DatasetOrigin } from "./data";
import { exchangeCalendarSpec, TradingCalendar, type ExchangeCalendarSpec } from "./calendar";
import type { DatasetManifest, DataQualitySummary } from "./experiment";

export interface HistoricalPreflightCheck { code: string; passed: boolean; expected?: unknown; observed?: unknown; detail: string; }
export interface HistoricalPreflightResult { passed: boolean; checks: readonly HistoricalPreflightCheck[]; blockingReasons: readonly string[]; canonicalDatasetHash: string; dataQuality: DataQualitySummary; calendarSpec: ExchangeCalendarSpec; sessionCount: number; }

function check(code: string, passed: boolean, detail: string, expected?: unknown, observed?: unknown): HistoricalPreflightCheck { return { code, passed, detail, expected, observed }; }

function qualityFor(manifest: DatasetManifest, bars: readonly Bar[], calendar: TradingCalendar): DataQualitySummary {
  const issues: string[] = []; let invalid = 0; let duplicate = 0; let gaps = 0; const symbols = [...new Set(bars.map((bar) => bar.symbol))].sort(); const bySymbol = new Map<string, Bar[]>(); const seen = new Set<string>(); const lastInput = new Map<string, number>(); for (const bar of bars) { const previous = lastInput.get(bar.symbol); if (previous !== undefined && bar.startMs <= previous) issues.push(`NON_MONOTONIC:${bar.symbol}:${bar.startMs}`); lastInput.set(bar.symbol, bar.startMs); }
  for (const bar of [...bars].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.startMs - b.startMs)) {
    try { validateBar(bar); } catch { invalid++; issues.push(`INVALID_BAR:${bar.symbol}:${bar.startMs}`); }
    if (bar.intervalMs !== manifest.barIntervalMs) { invalid++; issues.push(`INTERVAL_MISMATCH:${bar.symbol}:${bar.startMs}`); }
    const key = `${bar.symbol}:${bar.startMs}`; if (seen.has(key)) { duplicate++; issues.push(`DUPLICATE:${key}`); } seen.add(key);
    bySymbol.set(bar.symbol, [...(bySymbol.get(bar.symbol) ?? []), bar]);
    if (!manifest.symbols.includes(bar.symbol)) issues.push(`UNDECLARED_SYMBOL:${bar.symbol}`);
    if (bar.startMs < manifest.startTimestamp || bar.startMs + bar.intervalMs > manifest.endTimestamp) issues.push(`OUT_OF_RANGE:${key}`);
    if (manifest.expectedSession === "REGULAR" && (!calendar.isRegularSession(bar.startMs) || !calendar.isRegularSession(bar.startMs + bar.intervalMs - 1))) issues.push(`OUTSIDE_EXPECTED_SESSION:${key}`);
  }
  for (const [symbol, rows] of bySymbol) for (let i = 1; i < rows.length; i++) { const delta = rows[i]!.startMs - rows[i - 1]!.startMs; if (delta <= 0) issues.push(`NON_MONOTONIC:${symbol}:${rows[i]!.startMs}`); else if (delta !== manifest.barIntervalMs && (!calendar || calendar.sessionKey(rows[i]!.startMs) === calendar.sessionKey(rows[i - 1]!.startMs))) { gaps++; issues.push(`GAP:${symbol}:${rows[i]!.startMs}`); } }
  if (manifest.expectedSession === "REGULAR" && (manifest.sessionCoveragePolicy ?? "FULL_RTH") === "FULL_RTH") for (const symbol of manifest.symbols) for (let day = 0; day <= Math.ceil((manifest.endTimestamp - manifest.startTimestamp) / 86_400_000) + 2; day++) { const bounds = calendar.sessionBounds(manifest.startTimestamp + day * 86_400_000); if (bounds.openMs < manifest.startTimestamp || bounds.closeMs > manifest.endTimestamp || !calendar.isRegularSession(bounds.openMs)) continue; const expected: number[] = []; for (let ts = bounds.openMs; ts < bounds.closeMs; ts += manifest.barIntervalMs) expected.push(ts); const observed = new Set((bySymbol.get(symbol) ?? []).map((bar) => bar.startMs)); const missing = expected.filter((ts) => !observed.has(ts)); if (missing.length) { gaps++; issues.push(missing.length === expected.length ? `MISSING_SESSION:${symbol}:${bounds.sessionKey}` : `MISSING_SESSION_BARS:${symbol}:${bounds.sessionKey}:${missing.length}`); } }
  if (manifest.corporateActionStatus === "UNKNOWN" || manifest.corporateActionStatus === "UNSAFE") issues.push("CORPORATE_ACTIONS_UNSAFE_OR_UNKNOWN");
  if (symbols.join("\u0000") !== [...manifest.symbols].sort().join("\u0000")) issues.push("SYMBOL_MISMATCH");
  return { totalRows: bars.length, acceptedRows: Math.max(0, bars.length - invalid - duplicate), rejectedRows: invalid + duplicate, duplicateRows: duplicate, invalidRows: invalid, unexpectedGaps: gaps, symbols, issues };
}

export function runHistoricalPreflight(manifest: DatasetManifest, bars: readonly Bar[]): HistoricalPreflightResult {
  const calendarSpec = exchangeCalendarSpec({ timeZone: manifest.timezone, holidays: manifest.calendarHolidays, earlyCloses: manifest.calendarEarlyCloses, ...(manifest.expectedSession === "ALL" ? { sessionOpenHour: 0, sessionOpenMinute: 0, sessionCloseHour: 23, sessionCloseMinute: 59 } : {}) });
  const calendar = new TradingCalendar(calendarSpec.config); const dataQuality = qualityFor(manifest, bars, calendar); const actualHash = canonicalDatasetHash(bars); const origins: DatasetOrigin[] = ["EXTERNAL_HISTORICAL_FILE", "SYNTHETIC_FIXTURE"];
  const checks: HistoricalPreflightCheck[] = [
    check("DATASET_ORIGIN_VALID", origins.includes(manifest.origin), "Origin is an explicitly supported value", origins, manifest.origin),
    check("SOURCE_METADATA_COMPLETE", manifest.origin === "SYNTHETIC_FIXTURE" || (manifest.source.trim().length > 0 && manifest.licenceNotes.trim().length > 0), "External source and licence notes are explicit"),
    check("PERMITTED_FOR_RESEARCH", manifest.origin === "SYNTHETIC_FIXTURE" || manifest.permittedForResearch === true, "Research permission is explicit", true, manifest.permittedForResearch),
    check("CANONICALIZATION_VERSION_MATCH", manifest.canonicalizationVersion === BAR_CANONICALIZATION_VERSION, "Canonicalization version matches runtime", BAR_CANONICALIZATION_VERSION, manifest.canonicalizationVersion),
    check("CANONICAL_DATA_HASH_MATCH", manifest.contentHash !== "AUTO" && actualHash === manifest.contentHash, "Manifest hash matches canonical bars", actualHash, manifest.contentHash),
    check("DATASET_ID_VALID", /^[A-Za-z0-9._-]+$/.test(manifest.datasetId), "Dataset ID is stable and non-empty", "stable identifier", manifest.datasetId),
    check("DATASET_VERSION_VALID", manifest.datasetVersion.trim().length > 0, "Dataset version is explicit"),
    check("SYMBOL_UNIVERSE_MATCH", dataQuality.symbols.join("\u0000") === [...manifest.symbols].sort().join("\u0000"), "Observed symbols equal manifest symbols", manifest.symbols, dataQuality.symbols),
    check("INPUT_ORDER_VALID", !dataQuality.issues.some((issue) => issue.startsWith("NON_MONOTONIC")), "Input bars are chronological within each symbol"),
    check("NO_UNDECLARED_SYMBOLS", !dataQuality.issues.some((issue) => issue.startsWith("UNDECLARED_SYMBOL")), "No bar uses an undeclared symbol"),
    check("BAR_INTERVAL_MATCH", dataQuality.issues.every((issue) => !issue.startsWith("INTERVAL_MISMATCH")), "Every bar uses the manifest interval", manifest.barIntervalMs),
    check("TIMESTAMP_RANGE_MATCH", dataQuality.issues.every((issue) => !issue.startsWith("OUT_OF_RANGE")), "Every bar is within the manifest range"),
    check("OHLCV_VALID", dataQuality.invalidRows === 0, "All OHLCV rows pass validation", 0, dataQuality.invalidRows),
    check("NO_DUPLICATE_BARS", dataQuality.duplicateRows === 0, "No duplicate symbol/timestamp bars", 0, dataQuality.duplicateRows),
    check("NO_UNEXPECTED_GAPS", dataQuality.unexpectedGaps === 0, "No unexpected gaps or incomplete sessions", 0, dataQuality.unexpectedGaps),
    check("SESSION_COVERAGE_VALID", !dataQuality.issues.some((issue) => issue.startsWith("OUTSIDE_EXPECTED_SESSION") || issue.startsWith("MISSING_SESSION")), "Session coverage matches manifest policy"),
    check("NO_OUTSIDE_SESSION_BARS", !dataQuality.issues.some((issue) => issue.startsWith("OUTSIDE_EXPECTED_SESSION")), "No bar is outside the declared session"),
    check("NO_MISSING_REQUIRED_SESSIONS", !dataQuality.issues.some((issue) => issue.startsWith("MISSING_SESSION")), "All required sessions and bars are present"),
    check("CALENDAR_ID_MATCH", manifest.calendarId === calendarSpec.calendarId, "Calendar ID matches resolved calendar", calendarSpec.calendarId, manifest.calendarId),
    check("CALENDAR_VERSION_MATCH", manifest.calendarSpecVersion === calendarSpec.version, "Calendar version matches resolved calendar", calendarSpec.version, manifest.calendarSpecVersion),
    check("CALENDAR_HASH_MATCH", manifest.calendarSpecHash === calendarSpec.contentHash, "Calendar hash matches resolved calendar", calendarSpec.contentHash, manifest.calendarSpecHash),
    check("ADJUSTMENT_STATUS_CONFIRMED", manifest.adjustmentType !== "UNCONFIRMED", "Adjustment status is user-confirmed", "not UNCONFIRMED", manifest.adjustmentType),
    check("CORPORATE_ACTION_STATUS_SAFE", manifest.corporateActionStatus === "NONE_IN_RANGE" || manifest.corporateActionStatus === "HANDLED" || manifest.assetClass === "OTHER", "Corporate-action status is safe", ["NONE_IN_RANGE", "HANDLED"], manifest.corporateActionStatus),
    check("FEATURE_SET_VERSION_MATCH", manifest.featureSetVersion === "baseline-ohlcv-v2", "Feature set version is supported", "baseline-ohlcv-v2", manifest.featureSetVersion),
    check("TARGET_VERSION_MATCH", manifest.targetVersion === "triple-barrier-next-open-20-u1.5-d1-v1", "Target version is supported", "triple-barrier-next-open-20-u1.5-d1-v1", manifest.targetVersion),
    check("LABEL_POLICY_VERSION_MATCH", manifest.labelPolicyVersion === "tb-up-vs-down-exclude-timeout-ambiguous-v1", "Label policy version is supported", "tb-up-vs-down-exclude-timeout-ambiguous-v1", manifest.labelPolicyVersion),
    check("DATA_QUALITY_ALL_CLEAR", dataQuality.issues.length === 0, "Every data-quality issue is covered and cleared", 0, dataQuality.issues)
  ];
  const blockingReasons = checks.filter((item) => !item.passed).map((item) => item.code); return { passed: blockingReasons.length === 0, checks, blockingReasons, canonicalDatasetHash: actualHash, dataQuality, calendarSpec, sessionCount: new Set(bars.map((bar) => calendar.sessionKey(bar.startMs))).size };
}
