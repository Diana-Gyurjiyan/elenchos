import {
  EMPTY_CRITIC,
  type Analysis,
  type ClaimRole,
  type Formalization,
  type InferenceType,
  type AnalysisTier,
} from "./types";

const ROLES: ClaimRole[] = ["premise", "intermediate", "conclusion", "assumption", "objection"];
const INFERENCE_TYPES: InferenceType[] = [
  "deductive",
  "inductive",
  "abductive",
  "analogical",
  "causal",
  "authority",
  "other",
];
const STRENGTHS = ["weak", "moderate", "strong", "valid"] as const;
const REVIEW_STRENGTHS = ["non_sequitur", ...STRENGTHS] as const;

const text = (value: unknown, max = 400): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const choice = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;

function formalization(value: unknown): Formalization | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const conclusion = text(item.conclusion, 300);
  if (!conclusion) return null;
  const premises = Array.isArray(item.premises)
    ? item.premises.map((premise) => text(premise, 300)).filter(Boolean)
    : [];
  return { logic: choice(item.logic, ["prop", "fol"] as const, "prop"), premises, conclusion };
}

function taken(analysis: Analysis, id: string): boolean {
  return (
    analysis.claims.some((claim) => claim.id === id) ||
    analysis.infs.some((inference) => inference.id === id) ||
    analysis.critic.missing.some((missing) => missing.id === id)
  );
}

export function normalizeAgentA(analysis: Analysis, raw: Record<string, unknown>, tier: AnalysisTier = "default"): void {
  const t = raw.t;
  if (t === "meta") {
    analysis.meta = {
      title: text(raw.title, 120),
      main: text(raw.main, 40),
      summary: text(raw.summary, 500),
      genre: text(raw.genre, 40),
    };
  } else if (t === "claim") {
    const id = text(raw.id, 40);
    const claimText = text(raw.text, 320);
    const claimLimit = tier === "quick" ? 12 : 30;
    if (!id || !claimText || taken(analysis, id) || analysis.claims.length >= claimLimit) return;
    analysis.claims.push({
      id,
      text: claimText,
      role: choice(raw.role, ROLES, "premise"),
      quote: text(raw.quote, 320) || null,
    });
  } else if (t === "inference") {
    const id = text(raw.id, 40);
    const to = text(raw.to, 40);
    const from = Array.isArray(raw.from)
      ? [...new Set(raw.from.map((claimId) => text(claimId, 40)).filter((claimId) =>
          analysis.claims.some((claim) => claim.id === claimId),
        ))]
      : [];
    if (!id || taken(analysis, id) || !from.length || !analysis.claims.some((claim) => claim.id === to)) return;
    if (analysis.infs.length >= (tier === "quick" ? 8 : 20)) return;
    analysis.infs.push({
      id,
      from,
      to,
      type: choice(raw.type, INFERENCE_TYPES, "other"),
      strength: choice(raw.strength, STRENGTHS, "moderate"),
      note: text(raw.note, 300),
      formal: formalization(raw.formal),
    });
  } else if (t === "attack") {
    const from = text(raw.from, 40);
    const to = text(raw.to, 40);
    const targetExists =
      analysis.claims.some((claim) => claim.id === to) ||
      analysis.infs.some((inference) => inference.id === to);
    if (!analysis.claims.some((claim) => claim.id === from) || !targetExists) return;
    analysis.attacks.push({
      from,
      to,
      kind: choice(raw.kind, ["rebut", "undercut"] as const, "rebut"),
      note: text(raw.note, 300),
    });
  }
}

export function normalizeAgentB(analysis: Analysis, raw: Record<string, unknown>, tier: AnalysisTier = "default"): void {
  const critic = analysis.critic;
  const findingLimit = tier === "quick" ? 6 : 12;
  const findingCount = critic.claimReviews.length + critic.fallacies.length + critic.missing.length;
  const t = raw.t;
  if (t === "claim_review") {
    const id = text(raw.id, 40);
    if (!analysis.claims.some((claim) => claim.id === id)) return;
    if (!critic.claimReviews.some((review) => review.id === id) && findingCount >= findingLimit) return;
    critic.claimReviews = critic.claimReviews.filter((review) => review.id !== id);
    critic.claimReviews.push({
      id,
      roleOk: raw.role_ok !== false,
      suggestRole: ROLES.includes(raw.suggest_role as ClaimRole) ? (raw.suggest_role as ClaimRole) : null,
      note: text(raw.note, 300),
    });
  } else if (t === "inference_review") {
    const id = text(raw.id, 40);
    if (!analysis.infs.some((inference) => inference.id === id)) return;
    critic.infReviews = critic.infReviews.filter((review) => review.id !== id);
    critic.infReviews.push({
      id,
      strength: choice(raw.strength, REVIEW_STRENGTHS, "moderate"),
      note: text(raw.note, 300),
    });
  } else if (t === "formal") {
    const inference = text(raw.inference, 40);
    const formal = formalization(raw.formal);
    if (!analysis.infs.some((item) => item.id === inference) || !formal) return;
    critic.formals = critic.formals.filter((item) => item.inference !== inference);
    critic.formals.push({ inference, formal });
  } else if (t === "fallacy") {
    const targets = Array.isArray(raw.targets)
      ? [...new Set(raw.targets.map((id) => text(id, 40)).filter((id) =>
          analysis.claims.some((claim) => claim.id === id) ||
          analysis.infs.some((inference) => inference.id === id),
        ))]
      : [];
    const name = text(raw.name, 120);
    const explanation = text(raw.explanation, 500);
    if (!targets.length || !name || !explanation || findingCount >= findingLimit) return;
    critic.fallacies.push({
      name,
      kind: choice(raw.kind, ["formal", "informal"] as const, "informal"),
      targets,
      severity: Math.max(1, Math.min(3, Number.parseInt(String(raw.severity), 10) || 2)),
      quote: text(raw.quote, 300) || null,
      explanation,
    });
  } else if (t === "missing") {
    const feeds = text(raw.feeds, 40);
    const feedsExists =
      analysis.claims.some((claim) => claim.id === feeds) ||
      analysis.infs.some((inference) => inference.id === feeds);
    const missingText = text(raw.text, 320);
    if (!feedsExists || !missingText || findingCount >= findingLimit) return;
    let id = text(raw.id, 40) || `m${critic.missing.length + 1}`;
    while (taken(analysis, id)) id += "_";
    critic.missing.push({
      id,
      text: missingText,
      feeds,
      kind: choice(raw.kind, ["assumption", "counterargument"] as const, "assumption"),
    });
  } else if (t === "overall") {
    critic.overall = {
      verdict: choice(raw.verdict, ["strong", "mixed", "weak"] as const, "mixed"),
      note: text(raw.note, 400),
    };
  }
}

export function createAnalysis(source: string, lang: "nl" | "en", tier: AnalysisTier = "default"): Analysis {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    created: Date.now(),
    updated: Date.now(),
    lang,
    tier,
    text: source,
    meta: null,
    claims: [],
    infs: [],
    attacks: [],
    critic: {
      ...EMPTY_CRITIC,
      claimReviews: [],
      infReviews: [],
      fallacies: [],
      missing: [],
      formals: [],
    },
    checks: {},
    warnings: [],
    phase: "idle",
  };
}
