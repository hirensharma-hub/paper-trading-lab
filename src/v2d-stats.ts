export interface BootstrapSummary { seed: number; resamples: number; unit: "SESSION"; sessionCount: number; metric: "LOG_LOSS" | "BRIER"; meanDelta: number; p2_5: number; median: number; p97_5: number; positiveMedianMeansLogisticBetter: boolean; }

const percentile = (values: readonly number[], q: number) => { const sorted = [...values].sort((a, b) => a - b); const position = (sorted.length - 1) * q; const low = Math.floor(position); const high = Math.ceil(position); return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low); };
const nextRandom = (state: { value: number }) => { state.value ^= state.value << 13; state.value ^= state.value >>> 17; state.value ^= state.value << 5; return (state.value >>> 0) / 4_294_967_296; };

/** Paired bootstrap that samples complete sessions, preserving intraday dependence. */
export function sessionPairedBootstrap(rows: readonly { session: string; label: 0 | 1; constantProbability: number; logisticProbability: number }[], resamples = 10_000, seed = 20260826, metric: "LOG_LOSS" | "BRIER" = "LOG_LOSS"): BootstrapSummary {
  if (!rows.length || !Number.isInteger(resamples) || resamples <= 0) throw new Error("Invalid session bootstrap input");
  const grouped = new Map<string, typeof rows>(); for (const row of rows) grouped.set(row.session, [...(grouped.get(row.session) ?? []), row]); const sessions = [...grouped.keys()].sort(); if (!sessions.length) throw new Error("SESSION_BOOTSTRAP_NO_SESSIONS");
  const state = { value: seed | 0 || 1 }; const deltas: number[] = []; const loss = (label: 0 | 1, probability: number) => { const p = Math.min(1 - 1e-15, Math.max(1e-15, probability)); return -(label * Math.log(p) + (1 - label) * Math.log(1 - p)); };
  const score = (label: 0 | 1, probability: number) => metric === "BRIER" ? (probability - label) ** 2 : loss(label, probability);
  for (let replicate = 0; replicate < resamples; replicate++) { let constantLoss = 0, logisticLoss = 0, count = 0; for (let draw = 0; draw < sessions.length; draw++) { const selected = grouped.get(sessions[Math.floor(nextRandom(state) * sessions.length)]!)!; for (const row of selected) { constantLoss += score(row.label, row.constantProbability); logisticLoss += score(row.label, row.logisticProbability); count++; } } deltas.push((constantLoss - logisticLoss) / count); }
  return { seed, resamples, unit: "SESSION", sessionCount: sessions.length, metric, meanDelta: deltas.reduce((sum, value) => sum + value, 0) / deltas.length, p2_5: percentile(deltas, .025), median: percentile(deltas, .5), p97_5: percentile(deltas, .975), positiveMedianMeansLogisticBetter: percentile(deltas, .5) > 0 };
}
