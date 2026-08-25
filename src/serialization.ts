import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return null;
      return Object.is(item, -0) ? 0 : item;
    }
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function sha256CanonicalJson(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

export function sanitizeArtifact<T>(value: T, path = "artifact"): T {
  if (typeof value === "number" && !Number.isFinite(value)) { if (/probabilityBins\[\d+\]\./.test(path) || /\.metrics\.(totalReturn|cagr|annualisedReturn|annualisedVolatility|sharpe|sortino|calmar|maxDrawdown|drawdownDuration|maxDrawdownDurationMs|expectancy|winRate|profitFactor|averageWinner|averageLoser|payoffRatio)$/.test(path)) return null as T; throw new Error(`NON_FINITE_ARTIFACT:${path}`); }
  if (Array.isArray(value)) return value.map((child, index) => sanitizeArtifact(child, `${path}[${index}]`)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, sanitizeArtifact(child, `${path}.${key}`)])) as T;
  return value;
}

export function assertFiniteArtifact(value: unknown, path = "artifact"): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`NON_FINITE_ARTIFACT:${path}`);
  if (Array.isArray(value)) value.forEach((child, index) => assertFiniteArtifact(child, `${path}[${index}]`));
  else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, child]) => assertFiniteArtifact(child, `${path}.${key}`));
}

export interface ArtifactManifestEntry { relativePath: string; sizeBytes: number; sha256: string; artifactId?: string; kind?: string; }
export function verifyArtifactManifest(directory: string, manifest: { artifacts: readonly ArtifactManifestEntry[] }): { valid: boolean; failures: readonly string[] } { const failures: string[] = []; for (const artifact of manifest.artifacts) { const path = `${directory}/${artifact.relativePath}`; if (!existsSync(path)) { failures.push(`MISSING:${artifact.relativePath}`); continue; } const bytes = readFileSync(path); if (bytes.byteLength !== artifact.sizeBytes) failures.push(`SIZE:${artifact.relativePath}`); if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) failures.push(`HASH:${artifact.relativePath}`); } return { valid: failures.length === 0, failures }; }
