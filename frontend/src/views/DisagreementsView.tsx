import { useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { compareAnalysis } from "../capabilities/analysis/disagreements";
import type { Analysis } from "../capabilities/analysis/types";
import type { useAnalysis } from "../capabilities/analysis/useAnalysis";

type Controller = ReturnType<typeof useAnalysis>;
type Props = Pick<Controller, "analysis"> & { onShowNode: (id: string) => void };

function engineLabel(
  check: Analysis["checks"][string]["A"],
  formal: { premises: string[]; conclusion: string } | null,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (!formal) return t("eng.none");
  if (!check) return "…";
  if (!check.ok) return t("eng.unreadable");
  if (check.valid === true) return t("eng.valid");
  if (check.valid === false) return t("eng.invalid");
  if (check.status === "valid_bounded") return t("eng.likely");
  if (check.status === "vacuous_bounded" || check.status === "unsat_bounded") return t("eng.vacuous");
  return t("eng.unknown");
}

function FormalSummary({ formal }: { formal: { premises: string[]; conclusion: string } | null }) {
  if (!formal) return <span className="muted">—</span>;
  return (
    <div className="mono">
      {formal.premises.map((premise, index) => <div key={`${premise}-${index}`}>{premise}</div>)}
      <div>∴ {formal.conclusion}</div>
    </div>
  );
}

export function DisagreementsView({ analysis, onShowNode }: Props) {
  const { t } = useI18n();
  const comparisons = useMemo(() => analysis ? compareAnalysis(analysis) : [], [analysis]);
  if (!analysis) {
    return <div className="panel"><h2>{t("dis.title")}</h2><p className="note">{t("dis.empty")}</p></div>;
  }
  const counts = {
    agree: comparisons.filter((item) => item.kind === "agree").length,
    minor: comparisons.filter((item) => item.kind === "minor").length,
    conflict: comparisons.filter((item) => item.kind === "conflict").length,
  };
  const roles = analysis.critic.claimReviews.filter((review) => !review.roleOk);

  return (
    <div className="panel">
      <h2>{t("dis.title")}</h2>
      <p className="lead">{t("dis.intro")}</p>
      <div className="chipsrow">
        <span className="pill ok">{t("lvl.agree")}: {counts.agree}</span>
        <span className="pill">{t("lvl.minor")}: {counts.minor}</span>
        <span className="pill bad">{t("lvl.conflict")}: {counts.conflict}</span>
      </div>
      <h3 className="subh">{t("dis.steps")}</h3>
      {!comparisons.length && <p className="muted">{t("dis.none")}</p>}
      {comparisons.map(({ inference, agentB, kind, repair }) => {
        const formalB = analysis.critic.formals.find((item) => item.inference === inference.id)?.formal ?? null;
        const reviewB = analysis.critic.infReviews.find((item) => item.id === inference.id);
        const checkA = analysis.checks[inference.id]?.A;
        const checkB = analysis.checks[inference.id]?.B;
        const statusA = engineLabel(checkA, inference.formal, t);
        const statusB = engineLabel(checkB, formalB, t);
        return (
          <article className={`dcard ${kind}`} key={inference.id}>
            <div className="dhead2">
              <strong className="ttl">{inference.from.join(", ")} → {inference.to} · {t(`it.${inference.type}`)}</strong>
              <span className={`pill ${kind === "conflict" ? "bad" : kind === "minor" ? "warn" : kind === "agree" ? "ok" : ""}`}>{t(`lvl.${kind}`)}</span>
            </div>
            <div className="cols3">
              <div className="col">
                <h4>{t("col.a1")}</h4>
                <strong>{t(`str.${inference.strength}`)}</strong>
                {inference.note && <p>{inference.note}</p>}
                <FormalSummary formal={inference.formal} />
              </div>
              <div className="col">
                <h4>{t("col.a2")}</h4>
                {agentB ? <strong>{t(`str.${agentB}`)}</strong> : <span className="muted">{t("dis.pending")}</span>}
                {reviewB?.note && <p>{reviewB.note}</p>}
                <FormalSummary formal={formalB} />
              </div>
              <div className="col">
                <h4>{t("col.engine")}</h4>
                <div className="engline"><span>{t("dis.formalA")}:</span><strong>{statusA}</strong></div>
                <div className="engline"><span>{t("dis.formalB")}:</span><strong>{statusB}</strong></div>
                {repair && <p><strong>{t("dis.bridge")}:</strong> {repair}</p>}
              </div>
            </div>
            <button className="btn ghost small" type="button" onClick={() => onShowNode(inference.id)}>{t("dis.onmap")}</button>
          </article>
        );
      })}

      <h3 className="subh">{t("dis.roles")}</h3>
      {roles.length ? roles.map((review) => {
        const claim = analysis.claims.find((item) => item.id === review.id);
        return (
          <article className="dcard minor" key={review.id}>
            <strong>{claim?.text ?? review.id}</strong>
            {review.suggestRole && claim && <p>{t("d.roleDispute", { r: t(`role.${review.suggestRole}`) })}</p>}
            {review.note && <p>{review.note}</p>}
            <button className="btn ghost small" type="button" onClick={() => onShowNode(review.id)}>{t("dis.onmap")}</button>
          </article>
        );
      }) : <p className="muted">{t("dis.none")}</p>}

      <h3 className="subh">{t("dis.onlyb")}</h3>
      {[...analysis.critic.missing, ...analysis.critic.fallacies].length
        ? <>
          {analysis.critic.missing.map((missing) => (
            <article className="dcard minor" key={missing.id}>
              <strong>{t(`d.missing.${missing.kind}`)}</strong>
              <p>{missing.text}</p>
              <button className="btn ghost small" type="button" onClick={() => onShowNode(missing.id)}>{t("dis.onmap")}</button>
            </article>
          ))}
          {analysis.critic.fallacies.map((fallacy, index) => (
            <article className="dcard conflict" key={`${fallacy.name}-${index}`}>
              <strong>{fallacy.name}</strong>
              <p>{fallacy.explanation}</p>
              <div className="chipsrow">{fallacy.targets.map((target) => (
                <button className="btn ghost small" type="button" key={target} onClick={() => onShowNode(target)}>{target}</button>
              ))}</div>
            </article>
          ))}
        </>
        : <p className="muted">{t("dis.none")}</p>}
    </div>
  );
}
