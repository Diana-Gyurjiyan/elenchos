import type { ReactNode } from "react";
import type { EngineError, FolModel, Valuation, CheckSuccess, TruthTable } from "./engine";
import { useI18n } from "../../i18n/I18nProvider";
import { verdictParts } from "./verdict";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sec">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Verdict({ r }: { r: CheckSuccess }) {
  const { t } = useI18n();
  const v = verdictParts(r, t);
  return (
    <div className={"verdict " + v.cls}>
      <div className="big">
        <span aria-hidden="true">{v.glyph}</span>
        <span>{v.big}</span>
      </div>
      <div className="sub">{v.sub}</div>
    </div>
  );
}

export function ValuationChips({ v }: { v: Valuation }) {
  const { t } = useI18n();
  return (
    <div className="chips">
      {Object.entries(v).map(([k, val]) => (
        <span key={k} className={"chip " + (val ? "t" : "f")}>
          {k} = {t(val ? "true" : "false")}
        </span>
      ))}
    </div>
  );
}

export function TruthTableView({ table, r }: { table: TruthTable; r: CheckSuccess }) {
  const { t } = useI18n();
  const tv = (b: boolean) => (b ? t("tv.t") : t("tv.f"));
  return (
    <>
      <div className="tablewrap">
        <table className="tt">
          <thead>
            <tr>
              {table.atoms.map((a) => (
                <th key={a}>{a}</th>
              ))}
              {r.premises.map((p, i) => (
                <th key={i} className={i === 0 ? "sep" : ""} title={p}>
                  P{i + 1}
                </th>
              ))}
              <th className="sep" title={r.conclusion ?? ""}>
                C
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.mask} className={row.counter ? "counter" : row.model ? "model" : ""}>
                {row.values.map((v, i) => (
                  <td key={i} className={v ? "tv" : "fv"}>
                    {tv(v)}
                  </td>
                ))}
                {row.premises.map((v, i) => (
                  <td key={i} className={(i === 0 ? "sep " : "") + (v ? "tv" : "fv")}>
                    {tv(v)}
                  </td>
                ))}
                <td className={"sep " + (row.conclusion ? "tv" : "fv")}>{tv(row.conclusion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">{t("table.legend")}</p>
    </>
  );
}

const el = (i: number) => "e" + (i + 1);

export function ModelView({ m }: { m: FolModel }) {
  const { t } = useI18n();
  const domain = Array.from({ length: m.size }, (_, i) => i);
  return (
    <div className="model">
      <div className="pred">
        <span className="pname">{t("model.domain")}</span>
        <span className="chips">
          {domain.map((i) => (
            <span key={i} className="chip">
              {el(i)}
            </span>
          ))}
        </span>
      </div>
      {Object.entries(m.constants).map(([c, v]) => (
        <div key={c} className="pred">
          <span className="pname">{c}</span>
          <span className="chip">{el(v)}</span>
        </div>
      ))}
      {Object.entries(m.predicates).map(([p, tuples]) => {
        const arity = m.arities?.[p] ?? (tuples.length ? tuples[0].length : 1);
        let body: ReactNode;
        if (arity === 2) {
          body = (
            <span className="grid2" style={{ gridTemplateColumns: `repeat(${m.size + 1}, 22px)` }}>
              <span className="h" />
              {domain.map((j) => (
                <span key={"h" + j} className="h">
                  {el(j)}
                </span>
              ))}
              {domain.flatMap((i) => [
                <span key={"r" + i} className="h">
                  {el(i)}
                </span>,
                ...domain.map((j) => {
                  const on = tuples.some((x) => x[0] === i && x[1] === j);
                  return (
                    <span key={`${i}-${j}`} className={on ? "on" : ""}>
                      {on ? "●" : ""}
                    </span>
                  );
                }),
              ])}
            </span>
          );
        } else if (arity === 0) {
          body = <span className={"chip " + (tuples.length ? "t" : "f")}>{t(tuples.length ? "true" : "false")}</span>;
        } else if (tuples.length) {
          body = (
            <span className="chips">
              {tuples.map((x, k) => (
                <span key={k} className="chip">
                  {x.length === 1 ? el(x[0]) : "(" + x.map(el).join(", ") + ")"}
                </span>
              ))}
            </span>
          );
        } else {
          body = <span className="chip">∅</span>;
        }
        return (
          <div key={p} className="pred">
            <span className="pname">{p}</span>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function ErrorsBox({ errors }: { errors: EngineError[] }) {
  const { t } = useI18n();
  return (
    <div className="errbox">
      <strong>{t("err.title")}</strong>
      {errors.map((e, i) => (
        <div key={i}>
          {t("where." + e.where, { n: (e.index || 0) + 1 })}: {e.message}
          {e.pos != null && <span className="mono"> ({e.pos + 1})</span>}
        </div>
      ))}
    </div>
  );
}

interface BodyProps {
  r: CheckSuccess;
  hasConcl: boolean;
  /** Compact: used inside the map's detail panel (no parsed-formulas list, table folded away). */
  compact?: boolean;
  /** When given, repairs get an "add as premise" button. */
  onAddPremise?: (formula: string) => void;
}

/** The body of an engine result (port of `resultBodyHtml`). */
export function ResultBody({ r, hasConcl, compact = false, onAddPremise }: BodyProps) {
  const { t, lang } = useI18n();
  const chipList = (idx: number[], cls: string) => (
    <div className="chips">
      {idx.map((i) => (
        <span key={i} className={cls}>
          P{i + 1} {r.premises[i]}
        </span>
      ))}
    </div>
  );
  const table = r.logic === "prop" && r.table ? <TruthTableView table={r.table} r={r} /> : null;

  return (
    <>
      <Verdict r={r} />
      {!compact && (
        <Section title={t("sec.parsed")}>
          <ul className="formulas">
            {r.premises.map((p, i) => (
              <li key={i}>
                <span className="n">P{i + 1}</span>
                <span className="mono">{p}</span>
              </li>
            ))}
            {r.conclusion && (
              <li className="concl">
                <span className="n">∴</span>
                <span className="mono">{r.conclusion}</span>
              </li>
            )}
          </ul>
        </Section>
      )}
      {r.form && (
        <Section title={t("sec.form")}>
          <span className={"pill " + (r.form.valid ? "ok" : "bad")}>
            {r.form[lang]} · {t(r.form.valid ? "form.valid" : "form.fallacy")}
          </span>
        </Section>
      )}
      {r.inconsistentCore && (
        <Section title={t("sec.core")}>
          <p style={{ margin: "0 0 6px" }}>{t("core.text")}</p>
          {chipList(r.inconsistentCore, "chip f")}
        </Section>
      )}
      {r.logic === "prop" && r.counterexamples.length > 0 && (
        <Section title={t("sec.counter")}>
          <p style={{ margin: "0 0 6px" }}>{t("sec.counter.hint")}</p>
          <ValuationChips v={r.counterexamples[0]} />
        </Section>
      )}
      {r.logic === "fol" && r.counterModel && (
        <>
          <Section title={t("sec.model")}>
            <ModelView m={r.counterModel} />
          </Section>
          {r.emptyPredicates.length > 0 && (
            <p className="note">{t("import.note", { p: r.emptyPredicates.join(", ") })}</p>
          )}
        </>
      )}
      {r.logic === "fol" && !r.counterModel && r.witnessModel && !compact && (
        <Section title={t("sec.witness")}>
          <ModelView m={r.witnessModel} />
        </Section>
      )}
      {r.logic === "prop" && !hasConcl && r.satExample && (
        <Section title={t("sec.witness")}>
          <ValuationChips v={r.satExample} />
        </Section>
      )}
      {r.idle && r.idle.length > 0 && (
        <Section title={t("sec.idle")}>
          <p style={{ margin: "0 0 6px" }}>{t("idle.text")}</p>
          {chipList(r.idle, "chip")}
        </Section>
      )}
      {r.repairs.length > 0 && (
        <Section title={t("sec.repair")}>
          {r.repairs.map((x) => (
            <div key={x.formula} className="repair">
              <span className="mono">{x.formula}</span>
              {onAddPremise && (
                <button type="button" className="btn ghost small" onClick={() => onAddPremise(x.formula)}>
                  {t("repair.add")}
                </button>
              )}
            </div>
          ))}
          <p className="note">{t("repair.hint")}</p>
        </Section>
      )}
      {table &&
        (compact ? (
          <details className="sec">
            <summary className="dsum">{t("sec.table")}</summary>
            {table}
          </details>
        ) : (
          <Section title={t("sec.table")}>{table}</Section>
        ))}
    </>
  );
}
