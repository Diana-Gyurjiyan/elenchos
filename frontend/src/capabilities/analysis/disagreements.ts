import type { Analysis, AgentAStrength, AgentBStrength, Inference } from "./types";

export type DisagreementKind = "agree" | "minor" | "conflict" | "pending";

export interface InferenceDisagreement {
  inference: Inference;
  agentB: AgentBStrength | null;
  kind: DisagreementKind;
  logicStatus: string | null;
  repair: string | null;
}

const ranks: Record<AgentAStrength | "non_sequitur", number> = {
  weak: 0,
  non_sequitur: 0,
  moderate: 1,
  strong: 2,
  valid: 3,
};

export function compareAnalysis(analysis: Analysis): InferenceDisagreement[] {
  return analysis.infs.map((inference) => {
    const review = analysis.critic.infReviews.find((item) => item.id === inference.id);
    const agentB = review?.strength ?? null;
    const check = analysis.checks[inference.id];
    const bCheck = check?.B;
    const aCheck = check?.A;
    const logicStatus =
      bCheck?.ok ? bCheck.status : aCheck?.ok ? aCheck.status : null;
    const rankDifference = agentB ? Math.abs(ranks[inference.strength] - ranks[agentB]) : 0;
    const invalidFormal = Boolean((bCheck?.ok && bCheck.valid === false) || (aCheck?.ok && aCheck.valid === false));
    const kind: DisagreementKind = !agentB
      ? "pending"
      : invalidFormal || agentB === "non_sequitur" || rankDifference >= 2
        ? "conflict"
        : rankDifference === 1
          ? "minor"
          : "agree";
    const selectedCheck = bCheck?.ok ? bCheck : aCheck?.ok ? aCheck : null;
    return {
      inference,
      agentB,
      kind,
      logicStatus,
      repair: selectedCheck?.repairs[0]?.formula ?? null,
    };
  });
}

export function disagreementCount(analysis: Analysis): number {
  return compareAnalysis(analysis).filter((item) => item.kind === "minor" || item.kind === "conflict").length +
    analysis.critic.claimReviews.filter((review) => !review.roleOk).length;
}
