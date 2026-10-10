import type { Analysis, Formalization } from "./types";
import { compareAnalysis } from "./disagreements";
import type { Translate } from "../../i18n/translate";

const strengthKey = (strength: string) => `str.${strength}`;
const formalLines = (formal: Formalization | null) =>
  formal
    ? [...formal.premises.map((premise) => `  - ${premise}`), `  - ∴ ${formal.conclusion}`]
    : [];

export function analysisMarkdown(analysis: Analysis, t: Translate): string {
  const disagreements = compareAnalysis(analysis);
  const roleDisputes = analysis.critic.claimReviews.filter((review) => !review.roleOk);
  const checks = (id: string, side: "A" | "B") => {
    const check = analysis.checks[id]?.[side];
    if (!check) return t("eng.none");
    if (!check.ok) return t("eng.unreadable");
    if (check.valid === true) return t("eng.valid");
    if (check.valid === false) return t("eng.invalid");
    if (check.status === "valid_bounded") return t("eng.likely");
    if (check.status === "vacuous_bounded" || check.status === "unsat_bounded") return t("eng.vacuous");
    return t("eng.unknown");
  };
  const lines = [
    `# ${analysis.meta?.title || t("map.title")}`,
    "",
    `_${new Date(analysis.created).toLocaleString()}_`,
    `**${t("map.tier")}:** ${t(`tier.${analysis.tier}`)}`,
    ...(analysis.meta?.summary ? ["", analysis.meta.summary] : []),
    ...(analysis.critic.overall ? ["", `**${t("d.overall")}: ${t(`overall.${analysis.critic.overall.verdict}`)}.** ${analysis.critic.overall.note}`] : []),
    "",
    `## ${t("map.source")}`,
    "",
    analysis.text,
    "",
    `## ${t("map.claims")}`,
    "",
    ...analysis.claims.flatMap((claim) => [
      `- **${claim.id} · ${t(`role.${claim.role}`)}:** ${claim.text}`,
      ...(claim.quote ? [`  - ${t("d.quote")}: “${claim.quote}”`] : []),
      ...((review) => review && (!review.roleOk || review.note)
        ? [`  - ${t("d.a2")}: ${review.suggestRole ? t(`role.${review.suggestRole}`) : ""} ${review.note}`.trim()]
        : [])(analysis.critic.claimReviews.find((item) => item.id === claim.id)),
    ]),
    "",
    `## ${t("map.inferences")}`,
    "",
    ...analysis.infs.flatMap((inference) => {
      const review = analysis.critic.infReviews.find((item) => item.id === inference.id);
      const formalB = analysis.critic.formals.find((item) => item.inference === inference.id)?.formal ?? null;
      return [
        `- **${inference.id} · ${t(`it.${inference.type}`)}:** ${inference.from.join(", ")} → ${inference.to}`,
        `  - ${t("d.a1")}: ${t(strengthKey(inference.strength))}${inference.note ? ` — ${inference.note}` : ""}`,
        ...(review ? [`  - ${t("d.a2")}: ${t(strengthKey(review.strength))}${review.note ? ` — ${review.note}` : ""}`] : []),
        `  - ${t("col.engine")}: ${t("dis.formalA")} — ${checks(inference.id, "A")}; ${t("dis.formalB")} — ${checks(inference.id, "B")}`,
        ...formalLines(inference.formal),
        ...(formalB ? [`  - ${t("d.formalB")}:`, ...formalLines(formalB)] : []),
      ];
    }),
  ];
  if (analysis.attacks.length) {
    lines.push("", `## ${t("map.attacks")}`, "", ...analysis.attacks.map((attack) =>
      `- ${attack.from} → ${attack.to} (${t(`attack.${attack.kind}`)}): ${attack.note}`,
    ));
  }
  if (
    analysis.critic.fallacies.length ||
    analysis.critic.missing.length ||
    roleDisputes.length ||
    disagreements.some((item) => item.kind === "minor" || item.kind === "conflict")
  ) {
    lines.push("", `## ${t("tab.dis")}`, "");
    lines.push(...analysis.critic.fallacies.flatMap((fallacy) => [
      `- **${fallacy.name}** (${fallacy.targets.join(", ")}; ${t("d.sev", { n: fallacy.severity })}): ${fallacy.explanation}`,
      ...(fallacy.quote ? [`  - ${t("d.quote")}: “${fallacy.quote}”`] : []),
    ]));
    lines.push(...analysis.critic.missing.map((missing) =>
      `- **${t(`d.missing.${missing.kind}`)} → ${missing.feeds}:** ${missing.text}`,
    ));
    lines.push(...roleDisputes.map((review) => {
      const claim = analysis.claims.find((item) => item.id === review.id);
      const role = review.suggestRole
        ? t(`role.${review.suggestRole}`)
        : t(`role.${claim?.role ?? "premise"}`);
      return `- ${t("d.roleDispute", { r: role })}: ${claim?.text ?? review.id}${review.note ? ` — ${review.note}` : ""}`;
    }));
    lines.push(...disagreements.filter((item) => item.kind === "minor" || item.kind === "conflict").map((item) =>
      `- ${item.inference.id}: ${t(`lvl.${item.kind}`)} (${t(strengthKey(item.inference.strength))} / ${item.agentB ? t(strengthKey(item.agentB)) : "—"})`,
    ));
  }
  lines.push("", t("rep.footer"));
  return `${lines.join("\n")}\n`;
}

export function analysisJson(analysis: Analysis): string {
  return `${JSON.stringify(analysis, null, 2)}\n`;
}
