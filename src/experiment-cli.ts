import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { versions } from "node:process";
import { execFileSync } from "node:child_process";
import { ExperimentRunner, type DatasetManifest, type ExperimentConfig, FIRST_LABEL_POLICY, FIRST_TARGET } from "./experiment";
import { loadBarsFile } from "./historical-data";
import { assertFiniteArtifact, canonicalJson, sanitizeArtifact, sha256CanonicalJson, verifyArtifactManifest } from "./serialization";

const args = process.argv.slice(2);
const gitCommit = (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return process.env.GIT_COMMIT ?? "unknown"; } })();
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const output = value("--output");
const fail = (message: string, code = 1): never => { console.error(message); process.exit(code); };

if (args.includes("--synthetic")) {
  const report = new ExperimentRunner().syntheticSmoke();
  if (output) writeArtifacts(output, report, undefined, args.includes("--overwrite"));
  printSummary(report);
  if (report.status !== "COMPLETED") process.exitCode = 1;
} else {
  const dataPath = value("--data"); const configPath = value("--config");
  if (!dataPath || !configPath || !output) fail("Usage: npm run experiment -- --data FILE --config FILE --output DIR [--overwrite]", 2);
  try {
    const config = JSON.parse(readFileSync(configPath!, "utf8")) as ExperimentConfig & { manifest?: DatasetManifest };
    const manifestPath = value("--manifest");
    const manifest = manifestPath ? JSON.parse(readFileSync(manifestPath, "utf8")) as DatasetManifest : config.manifest;
    if (!manifest) fail("Manifest must be embedded in config or supplied with --manifest FILE", 2);
    const requiredManifest = manifest as DatasetManifest;
    const bars = loadBarsFile(dataPath!, { intervalMs: requiredManifest.barIntervalMs, symbols: requiredManifest.symbols });
    const report = new ExperimentRunner().run({ manifest: requiredManifest, config, bars });
    writeArtifacts(output!, report, { ...config, manifest: requiredManifest }, args.includes("--overwrite"));
    printSummary(report);
    if (report.status === "COMPLETED" && report.historicalReadiness?.readyForInterpretation === false) process.exitCode = 3;
    else if (report.status !== "COMPLETED") process.exitCode = 1;
  } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
}

function writeArtifacts(directory: string, report: ReturnType<ExperimentRunner["syntheticSmoke"]>, inputConfig?: ExperimentConfig & { manifest: DatasetManifest }, overwrite = false): void {
  if (existsSync(directory) && readdirSync(directory).length && !overwrite) fail("OUTPUT_DIRECTORY_EXISTS: pass --overwrite to replace it");
  if (overwrite && existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const replay = report.integratedReplay;
  const files: Record<string, unknown> = {
    "dataset-manifest": inputConfig?.manifest ?? report.manifest,
    "experiment-config": inputConfig ?? report.config,
    "data-quality": report.dataQuality,
    "historical-preflight": report.historicalPreflight,
    "split-report": report.actualRanges,
    "purge-report": report.splitPurge,
    "split-purge": report.splitPurge,
    "eligibility-audit": report.test,
    "target-definition": FIRST_TARGET,
    "label-policy": FIRST_LABEL_POLICY,
    "validation-report": report.validation,
    "calibration-report": report.calibration,
    "test-classification-report": report.test,
    "decision-funnel": report.test?.expectedValueAudit?.funnel ?? replay?.decisionFunnel,
    "research-reports": report.researchReports,
    "model-artifact": report.persistedArtifacts?.modelArtifact,
    "ood-profile": report.persistedArtifacts?.modelArtifact.oodProfile,
    "analogue-scaler": report.persistedArtifacts?.analogueScaler,
    "analogue-database": report.persistedArtifacts?.analogueDatabase,
    "frozen-runtime": report.frozenRuntime,
    "integrated-replay-report": replay,
    "execution-intents": replay?.executionAudits,
    "execution-audits": replay?.executionAudits,
    orders: replay?.orders,
    fills: replay?.fills,
    trades: replay?.trades,
    "portfolio-snapshots": replay?.portfolioSnapshots,
    "equity-curve": replay?.decisionWindowResult?.equityCurve,
    "prediction-records": replay?.predictionRecords,
    "resolved-experiences": replay?.resolvedExperiences,
    predictions: replay?.predictionRecords,
    experiences: replay?.resolvedExperiences,
    "settlement-report": replay?.settlementResult,
    "benchmark-report": report.benchmarks,
    "historical-readiness": report.historicalReadiness,
    "synthetic-notice": report.sourceDataKind === "SYNTHETIC_FIXTURE" ? "SYNTHETIC ONLY; NOT HISTORICAL MARKET EVIDENCE" : null,
    "reproducibility-metadata": { gitCommit, nodeVersion: versions.node, experimentRunnerVersion: "paper-trading-lab-0.1.0", seed: report.config?.seed, datasetHash: report.manifest?.contentHash, calendarHash: report.manifest?.calendarSpecHash, featureSetVersion: report.manifest?.featureSetVersion, targetVersion: report.manifest?.targetVersion, labelPolicyVersion: report.manifest?.labelPolicyVersion, executionMethodology: report.config?.executionPolicy, costMethodology: report.config?.costModel, metricMethodology: { frequency: report.config?.metricFrequency, gapPolicy: report.config?.gapPolicy }, timestampBatchMethodology: replay?.timestampBatchPolicyVersion }
  };
  const artifacts = Object.entries(files).map(([name, content]) => {
    const safe = sanitizeArtifact(content === undefined ? null : content);
    assertFiniteArtifact(safe, name);
    const serialized = canonicalJson(safe);
    const relativePath = `${name}.json`;
    writeFileSync(`${directory}/${relativePath}`, serialized);
    return { artifactId: `${report.experimentId}-${name}`, kind: name, relativePath, schemaVersion: "artifact-json-v1", sizeBytes: Buffer.byteLength(serialized), sha256: sha256CanonicalJson(safe) };
  });
  const manifest = { experimentId: report.experimentId, artifacts };
  const verification = verifyArtifactManifest(directory, manifest); if (!verification.valid) fail(`ARTIFACT_MANIFEST_VERIFICATION_FAILED:${verification.failures.join(",")}`);
  writeFileSync(`${directory}/artifact-manifest.json`, canonicalJson(manifest));
  writeFileSync(`${directory}/experiment-report.json`, canonicalJson({ ...report, artifactManifest: manifest, artifactVerification: verification }));
}

function printSummary(report: ReturnType<ExperimentRunner["syntheticSmoke"]>): void {
  const replay = report.integratedReplay; const readiness = report.historicalReadiness;
  console.log(JSON.stringify({ Experiment: report.experimentId, Dataset: report.datasetId, Origin: report.sourceDataKind, Source: report.manifest?.source, FeatureParity: report.featureParity, Symbols: report.manifest?.symbols, Rows: report.dataQuality.totalRows, Interval: report.manifest?.barIntervalMs, TRAIN: report.sampleSizes.TRAIN, VALIDATION: report.sampleSizes.VALIDATION, CALIBRATION: report.sampleSizes.CALIBRATION, TEST_all: report.test?.allTestDecisionCount, TEST_binary: report.test?.binaryEligibleTestDecisionCount, Purged: report.splitPurge.purgedObservationIds.length, SelectedL2: report.validation.selectedL2, RuntimeDecisions: replay?.decisionFunnel?.allTestDecisionCount, Predictions: replay?.predictionCount, BUY_decisions: replay?.decisionFunnel?.buyDecisionCount, Trades: replay?.tradeCount, Orders: replay?.orderCount, DecisionWindowOrders: replay?.decisionWindowOrderCount, TailOrders: replay?.tailOrderCount, SettlementOrders: replay?.settlementOrderCount, DecisionWindowReturn: replay?.decisionWindowResult?.totalReturn, SettledReturn: replay?.totalReturn, MaxDrawdown: replay?.metrics?.maxDrawdown, Sharpe: replay?.metrics?.sharpe, Fees: replay?.decisionWindowFees, Slippage: replay?.decisionWindowSlippage, HistoricalReadiness: readiness?.readyForInterpretation, BlockingReasons: readiness?.blockingReasons }, null, 2));
}
