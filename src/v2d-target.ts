import type { TargetDefinition } from "./targets";
import type { LabelPolicy } from "./ml";
import { FIRST_LABEL_POLICY, FIRST_TARGET } from "./experiment";

export const V2D_TARGET: TargetDefinition = {
  targetVersion: "triple-barrier-next-open-20-u1-d1-v2",
  kind: "TRIPLE_BARRIER",
  horizonBars: 20,
  timeBasis: "TRADING_BARS",
  entryReferenceMethod: "NEXT_BAR_OPEN",
  upperBarrierMultiple: 1,
  lowerBarrierMultiple: 1,
  ambiguityPolicy: "AMBIGUOUS",
};

export const V2D_LABEL_POLICY: LabelPolicy = {
  ...FIRST_LABEL_POLICY,
  targetVersion: V2D_TARGET.targetVersion,
};

export const V1_TARGET_VERSION = FIRST_TARGET.targetVersion;
