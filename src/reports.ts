export type ReportStatus = "NOT_TESTED" | "INSUFFICIENT_SAMPLE" | "PASSED" | "FAILED" | "DEGRADED";
export interface OutOfSampleReport { status: ReportStatus; sampleSize: number; expectedValue?: number; }
export interface CalibrationReport { status: ReportStatus; sampleSize: number; brier?: number; logLoss?: number; ece?: number; }
export interface CostStressReport { status: ReportStatus; sampleSize: number; minimumExpectedValue?: number; }
export interface WalkForwardReport { status: ReportStatus; folds: number; }
export interface RegimeCoverageReport { status: ReportStatus; regimes: readonly string[]; }
export interface ParameterStabilityReport { status: ReportStatus; testedConfigurations: number; }
export interface RecentStabilityReport { status: ReportStatus; sampleSize: number; }
