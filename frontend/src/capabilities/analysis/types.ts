import type { CheckResult } from "../logic/engine";

export type ClaimRole = "premise" | "intermediate" | "conclusion" | "assumption" | "objection";
export type InferenceType =
  | "deductive"
  | "inductive"
  | "abductive"
  | "analogical"
  | "causal"
  | "authority"
  | "other";
export type AgentAStrength = "weak" | "moderate" | "strong" | "valid";
export type AgentBStrength = "non_sequitur" | AgentAStrength;
export type AnalysisTier = "quick" | "default" | "complex";

export interface Formalization {
  logic: "prop" | "fol";
  premises: string[];
  conclusion: string;
}

export interface Claim {
  id: string;
  text: string;
  role: ClaimRole;
  quote: string | null;
}

export interface Inference {
  id: string;
  from: string[];
  to: string;
  type: InferenceType;
  strength: AgentAStrength;
  note: string;
  formal: Formalization | null;
}

export interface Attack {
  from: string;
  to: string;
  kind: "rebut" | "undercut";
  note: string;
}

export interface AnalysisMeta {
  title: string;
  main: string;
  summary: string;
  genre: string;
}

export interface ClaimReview {
  id: string;
  roleOk: boolean;
  suggestRole: ClaimRole | null;
  note: string;
}

export interface InferenceReview {
  id: string;
  strength: AgentBStrength;
  note: string;
}

export interface Fallacy {
  name: string;
  kind: "formal" | "informal";
  targets: string[];
  severity: number;
  quote: string | null;
  explanation: string;
}

export interface MissingClaim {
  id: string;
  text: string;
  feeds: string;
  kind: "assumption" | "counterargument";
}

export interface CriticFormalization {
  inference: string;
  formal: Formalization;
}

export interface CriticOverall {
  verdict: "strong" | "mixed" | "weak";
  note: string;
}

export interface CriticReview {
  claimReviews: ClaimReview[];
  infReviews: InferenceReview[];
  fallacies: Fallacy[];
  missing: MissingClaim[];
  formals: CriticFormalization[];
  overall: CriticOverall | null;
}

export interface Analysis {
  id: string;
  created: number;
  updated: number;
  lang: "nl" | "en";
  tier: AnalysisTier;
  text: string;
  meta: AnalysisMeta | null;
  claims: Claim[];
  infs: Inference[];
  attacks: Attack[];
  critic: CriticReview;
  checks: Record<string, Partial<Record<"A" | "B", CheckResult>>>;
  warnings: string[];
  phase: AnalysisPhase;
}

export type AnalysisPhase = "idle" | "a1" | "e1" | "a2" | "e2" | "done" | "failed" | "stopped";

export interface SavedAnalysis {
  kind: "analysis";
  id: string;
  created: number;
  updated: number;
  lang: "nl" | "en";
  tier?: AnalysisTier;
  title: string;
  text: string;
  meta: AnalysisMeta | null;
  claims: Claim[];
  infs: Inference[];
  attacks: Attack[];
  critic: CriticReview;
  phase: AnalysisPhase;
}

export const EMPTY_CRITIC: CriticReview = {
  claimReviews: [],
  infReviews: [],
  fallacies: [],
  missing: [],
  formals: [],
  overall: null,
};

export function packAnalysis(analysis: Analysis): SavedAnalysis {
  const saved: SavedAnalysis = {
    kind: "analysis",
    id: analysis.id,
    created: analysis.created,
    updated: Date.now(),
    lang: analysis.lang,
    title: analysis.meta?.title || analysis.text.slice(0, 60),
    text: analysis.text,
    meta: analysis.meta,
    claims: analysis.claims,
    infs: analysis.infs,
    attacks: analysis.attacks,
    critic: analysis.critic,
    phase: analysis.phase,
  };
  if (JSON.stringify(saved).length > 240_000) saved.text = analysis.text.slice(0, 6000);
  return saved;
}

export function restoreAnalysis(saved: SavedAnalysis): Analysis {
  return {
    ...saved,
    tier: saved.tier ?? "default",
    updated: saved.updated,
    checks: {},
    warnings: [],
    critic: { ...EMPTY_CRITIC, ...saved.critic },
  };
}
