import { useCallback, useEffect, useRef, useState } from "react";
import { useCapability } from "../capabilities/CapabilityProvider";
import type { CheckResult } from "../capabilities/logic/engine";
import type { LogicLabPort } from "../types";
import { LAB_EXAMPLES } from "../i18n/examples";
import { useI18n } from "../i18n/I18nProvider";
import { ErrorsBox, ResultBody } from "../capabilities/logic/ResultView";
import type { Analysis, Formalization } from "../capabilities/analysis/types";

type Mode = "auto" | "prop" | "fol";
const SYMBOLS = ["∀", "∃", "¬", "∧", "∨", "→", "↔", "=", "≠", "(", ")"];
const DEFAULT_EXAMPLE = LAB_EXAMPLES[2]; // the enthymeme, as in the original

export interface LabSeed {
  premises: string[];
  conclusion: string;
  inferenceId?: string;
  source?: "A" | "B";
  analysisId?: string;
  /** Change this to load a new seed (e.g. "open this inference in the lab" from the map). */
  nonce: number;
}

interface Outcome {
  res: CheckResult;
  hasConcl: boolean;
}

interface SourceInput {
  premises: string[];
  conclusion: string;
  mode: Mode;
}

async function compute(logic: LogicLabPort, prem: string, concl: string, mode: Mode, size: number): Promise<Outcome | null> {
  const premises = prem.split("\n").map((s) => s.trim()).filter(Boolean);
  const c = concl.trim();
  if (!premises.length && !c) return null;
  return { res: await logic.checkArgument(premises, c, { mode, maxSize: size || 4 }), hasConcl: !!c };
}

function getFormalization(
  analysis: Analysis | null,
  inferenceId: string,
  source: "A" | "B",
): Formalization | null {
  if (!analysis) return null;
  if (source === "A") {
    return analysis.infs.find((inference) => inference.id === inferenceId)?.formal ?? null;
  }
  return analysis.critic.formals.find((item) => item.inference === inferenceId)?.formal ?? null;
}

export function LogicLabView({ seed, analysis }: { seed?: LabSeed; analysis: Analysis | null }) {
  const { t } = useI18n();
  const logic = useCapability("logicLab");
  const [prem, setPrem] = useState(seed?.premises.join("\n") ?? DEFAULT_EXAMPLE.prem.join("\n"));
  const [concl, setConcl] = useState(seed?.conclusion ?? DEFAULT_EXAMPLE.concl);
  const [mode, setMode] = useState<Mode>("auto");
  const [size, setSize] = useState(4);
  const [example, setExample] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [inferenceId, setInferenceId] = useState(seed?.inferenceId ?? "");
  const [source, setSource] = useState<"A" | "B">(seed?.source ?? "A");
  const [sourceOutcome, setSourceOutcome] = useState<Outcome | null>(null);
  const [sourceChecking, setSourceChecking] = useState(false);
  const [sourceInput, setSourceInput] = useState<SourceInput | null>(() =>
    seed?.inferenceId ? { premises: seed.premises, conclusion: seed.conclusion, mode: "auto" } : null,
  );

  const premRef = useRef<HTMLTextAreaElement>(null);
  const conclRef = useRef<HTMLInputElement>(null);
  const lastField = useRef<"prem" | "concl">("prem");
  const requestSequence = useRef(0);
  const sourceSequence = useRef(0);
  const previousAnalysisId = useRef<string | null>(null);

  const run = useCallback(
    async (p = prem, c = concl, m = mode, s = size) => {
      if (!logic) return;
      const request = ++requestSequence.current;
      try {
        const next = await compute(logic, p, c, m, s);
        if (request === requestSequence.current) setOutcome(next);
      } catch (e) {
        if (request !== requestSequence.current) return;
        const message = e instanceof Error ? e.message : String(e);
        setOutcome({ res: { ok: false, errors: [{ where: "input", index: 0, message }] }, hasConcl: !!c.trim() });
      }
    },
    [logic, prem, concl, mode, size],
  );

  // Re-check shortly after the last edit, like the original's 350 ms debounce.
  useEffect(() => {
    const id = setTimeout(() => run(), 350);
    return () => clearTimeout(id);
  }, [run]);

  // Load a seed handed in from elsewhere (map -> lab).
  const lastNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!seed || seed.nonce === lastNonce.current) return;
    lastNonce.current = seed.nonce;
    const p = seed.premises.join("\n");
    setPrem(p);
    setConcl(seed.conclusion);
    setMode("auto");
    setExample("");
    setInferenceId(seed.inferenceId ?? "");
    setSource(seed.source ?? "A");
    setSourceOutcome(null);
    setSourceInput(seed.inferenceId
      ? { premises: seed.premises, conclusion: seed.conclusion, mode: "auto" }
      : null);
    run(p, seed.conclusion, "auto", size);
    window.scrollTo({ top: 0 });
  }, [seed, run, size, logic]);

  useEffect(() => {
    if (!sourceInput || !logic) {
      setSourceChecking(false);
      setSourceOutcome(null);
      return;
    }
    const request = ++sourceSequence.current;
    setSourceChecking(true);
    setSourceOutcome(null);
    void compute(
      logic,
      sourceInput.premises.join("\n"),
      sourceInput.conclusion,
      sourceInput.mode,
      size,
    ).then((next) => {
      if (request === sourceSequence.current) setSourceOutcome(next);
    }).catch((e: unknown) => {
      if (request !== sourceSequence.current) return;
      const message = e instanceof Error ? e.message : String(e);
      setSourceOutcome({
        res: { ok: false, errors: [{ where: "input", index: 0, message }] },
        hasConcl: !!sourceInput.conclusion.trim(),
      });
    }).finally(() => {
      if (request === sourceSequence.current) setSourceChecking(false);
    });
    return () => {
      if (request === sourceSequence.current) sourceSequence.current += 1;
    };
  }, [sourceInput, logic, size]);

  useEffect(() => {
    const currentId = analysis?.id ?? null;
    if (previousAnalysisId.current === currentId) return;
    previousAnalysisId.current = currentId;
    if (seed?.analysisId !== currentId) {
      setInferenceId("");
      setSourceOutcome(null);
      setSourceInput(null);
    }
  }, [analysis?.id, seed?.analysisId]);

  function chooseInference(id: string, requestedSource: "A" | "B" = "A") {
    setInferenceId(id);
    setSource(requestedSource);
    setExample("");
    const formal = getFormalization(analysis, id, requestedSource);
    if (!formal || !logic) {
      setSourceInput(null);
      setPrem("");
      setConcl("");
      return;
    }
    const p = formal.premises.join("\n");
    setPrem(p);
    setConcl(formal.conclusion);
    setMode(formal.logic);
    setSourceInput({ premises: formal.premises, conclusion: formal.conclusion, mode: formal.logic });
  }

  const selectedInference = analysis?.infs.find((item) => item.id === inferenceId);
  const formalA = selectedInference?.formal ?? null;
  const formalB = inferenceId
    ? analysis?.critic.formals.find((item) => item.inference === inferenceId)?.formal ?? null
    : null;
  const sourceClaims = selectedInference
    ? selectedInference.from.map((id) => analysis?.claims.find((claim) => claim.id === id)?.text ?? id)
    : [];
  const conclusionText = selectedInference
    ? analysis?.claims.find((claim) => claim.id === selectedInference.to)?.text ?? selectedInference.to
    : "";

  function insertSymbol(sym: string) {
    const isConcl = lastField.current === "concl";
    const field = isConcl ? conclRef.current : premRef.current;
    if (!field) return;
    const a = field.selectionStart ?? field.value.length;
    const b = field.selectionEnd ?? a;
    const next = field.value.slice(0, a) + sym + field.value.slice(b);
    (isConcl ? setConcl : setPrem)(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(a + sym.length, a + sym.length);
    });
  }

  function pickExample(id: string) {
    setExample(id);
    const ex = LAB_EXAMPLES.find((x) => x.id === id);
    if (!ex) return;
    const p = ex.prem.join("\n");
    setPrem(p);
    setConcl(ex.concl);
    setMode("auto");
    run(p, ex.concl, "auto", size);
  }

  function addPremise(formula: string) {
    const p = prem.replace(/\s+$/, "") + "\n" + formula;
    setPrem(p);
    run(p);
  }

  if (!logic) return <div className="panel">{t("logic.unavailable")}</div>;

  const syntaxRows: [string, string][] = [
    ["¬P \u00a0 !P \u00a0 ~P", "syntax.not"],
    ["P ∧ Q \u00a0 P & Q", "syntax.and"],
    ["P ∨ Q \u00a0 P | Q", "syntax.or"],
    ["P → Q \u00a0 P -> Q", "syntax.imp"],
    ["P ↔ Q \u00a0 P <-> Q", "syntax.iff"],
    ["∀x P(x) \u00a0 ∃x P(x)", "syntax.quant"],
    ["a = b \u00a0 a ≠ b", "syntax.eq"],
    ["∀x. P(x) → Q(x)", "syntax.scope"],
  ];

  return (
    <div className="lab">
      <div className="panel">
        <h2>{t("lab.title")}</h2>
        <p className="lead">{t("lab.intro")}</p>

        {analysis && (
          <section className="lab-review">
            <h3>{t("lab.review.title")}</h3>
            <p className="muted">{t("lab.review.intro")}</p>
            <label className="f" htmlFor="lab-inference">{t("lab.review.step")}</label>
            <select
              id="lab-inference"
              value={inferenceId}
              onChange={(event) => chooseInference(event.target.value)}
            >
              <option value="">{t("lab.review.pick")}</option>
              {analysis.infs.map((item, index) => {
                const claim = analysis.claims.find((candidate) => candidate.id === item.to);
                return (
                  <option key={item.id} value={item.id}>
                    {index + 1}. {claim?.text ?? item.to}
                  </option>
                );
              })}
            </select>
            {selectedInference && (
              <>
                <div className="lab-source">
                  <strong>{t("lab.review.original")}</strong>
                  {sourceClaims.map((claim, index) => <p key={`${index}-${claim}`}>{index + 1}. {claim}</p>)}
                  <p className="lab-source-conclusion"><strong>{t("lab.review.conclusion")}</strong> {conclusionText}</p>
                </div>
                <div className="row lab-source-buttons">
                  <span className="f">{t("lab.review.formalization")}</span>
                  <button
                    className="btn ghost small"
                    type="button"
                    disabled={!formalA}
                    aria-pressed={source === "A"}
                    onClick={() => chooseInference(inferenceId, "A")}
                  >
                    {t("d.a1")}
                  </button>
                  <button
                    className="btn ghost small"
                    type="button"
                    disabled={!formalB}
                    aria-pressed={source === "B"}
                    onClick={() => chooseInference(inferenceId, "B")}
                  >
                    {t("d.a2")}
                  </button>
                </div>
                {!formalA && !formalB && <p className="note">{t("lab.review.noformal")}</p>}
              </>
            )}
          </section>
        )}

        <label className="f" htmlFor="example">{t("lab.example")}</label>
        <select id="example" value={example} onChange={(e) => pickExample(e.target.value)}>
          <option value="">{t("ex.pick")}</option>
          {LAB_EXAMPLES.map((e) => (
            <option key={e.id} value={e.id}>{t("ex." + e.id)}</option>
          ))}
        </select>

        <label className="f" htmlFor="premises">{t("lab.premises")}</label>
        <textarea
          id="premises"
          ref={premRef}
          className="formula"
          rows={5}
          spellCheck={false}
          autoComplete="off"
          value={prem}
          onFocus={() => (lastField.current = "prem")}
          onChange={(e) => setPrem(e.target.value)}
        />

        <label className="f" htmlFor="conclusion">{t("lab.conclusion")}</label>
        <input
          id="conclusion"
          ref={conclRef}
          className="formula"
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={concl}
          onFocus={() => (lastField.current = "concl")}
          onChange={(e) => setConcl(e.target.value)}
        />

        <label className="f">{t("lab.symbols")}</label>
        <div className="symbols">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={s}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSymbol(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <div style={{ flex: "1 1 150px" }}>
            <label className="f" htmlFor="mode">{t("lab.mode")}</label>
            <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="auto">{t("mode.auto")}</option>
              <option value="prop">{t("mode.prop")}</option>
              <option value="fol">{t("mode.fol")}</option>
            </select>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <label className="f" htmlFor="size">{t("lab.size")}</label>
            <select id="size" value={size} onChange={(e) => setSize(parseInt(e.target.value, 10))}>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button className="btn" type="button" onClick={() => run()}>{t("lab.check")}</button>
        </div>

        <details className="syntax">
          <summary>{t("syntax.title")}</summary>
          <table>
            <tbody>
              {syntaxRows.map(([code, key]) => (
                <tr key={key}>
                  <td className="mono">{code}</td>
                  <td>{t(key)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div aria-live="polite">
        {inferenceId && (
          <div className="panel lab-comparison">
            <h3>{t("lab.review.originalResult")}</h3>
            {sourceChecking ? (
              <p className="muted">{t("lab.review.checking")}</p>
            ) : sourceOutcome?.res.ok ? (
              <ResultBody r={sourceOutcome.res} hasConcl={sourceOutcome.hasConcl} compact />
            ) : sourceOutcome && !sourceOutcome.res.ok ? (
              <ErrorsBox errors={sourceOutcome.res.errors} />
            ) : (
              <p className="muted">{t("lab.review.noformal")}</p>
            )}
          </div>
        )}
        {outcome && (
          <div className="panel lab-comparison">
            {inferenceId && <h3>{t("lab.review.revisedResult")}</h3>}
            {outcome.res.ok ? (
              <ResultBody r={outcome.res} hasConcl={outcome.hasConcl} onAddPremise={addPremise} />
            ) : (
              <ErrorsBox errors={outcome.res.errors} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
