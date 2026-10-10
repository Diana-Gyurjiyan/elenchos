import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { MAP_EXAMPLES } from "../i18n/examples";
import type { Analysis } from "../capabilities/analysis/types";
import { layoutArgument, type GraphNode } from "../capabilities/analysis/graph";
import type { useAnalysis } from "../capabilities/analysis/useAnalysis";
import { ErrorsBox, ResultBody } from "../capabilities/logic/ResultView";

type Controller = ReturnType<typeof useAnalysis>;
type Props = Controller & {
  onOpenLab: (premises: string[], conclusion: string, inferenceId: string, source: "A" | "B") => void;
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
};

const MAX_CHARS = 20_000;
const ACTIVE_PHASES = new Set(["a1", "e1", "a2", "e2"]);

function FormalBlock({
  label,
  formal,
  check,
}: {
  label: string;
  formal: { premises: string[]; conclusion: string } | null;
  check?: Analysis["checks"][string]["A"];
}) {
  const { t } = useI18n();
  if (!formal) return <p className="muted">{label}: {t("d.noformal")}</p>;
  return (
    <div className="formalblock">
      <div className="flabel">{label}</div>
      <ul className="formulas">
        {formal.premises.map((premise, index) => (
          <li key={`${premise}-${index}`}><span className="n">P{index + 1}</span><span className="mono">{premise}</span></li>
        ))}
        <li className="concl"><span className="n">∴</span><span className="mono">{formal.conclusion}</span></li>
      </ul>
      {check && (check.ok ? <ResultBody r={check} hasConcl /> : <ErrorsBox errors={check.errors} />)}
    </div>
  );
}

function NodeDetails({
  analysis,
  selected,
  onSelect,
  onOpenLab,
}: {
  analysis: Analysis;
  selected: GraphNode | undefined;
  onSelect: (id: string) => void;
  onOpenLab: (premises: string[], conclusion: string, inferenceId: string, source: "A" | "B") => void;
}) {
  const { t } = useI18n();
  if (!selected) {
    return (
      <div className="panel detail">
        <p className="muted">{t("d.select")}</p>
        {analysis.meta?.summary && (
          <section className="sec">
            <h3>{analysis.meta.title || t("map.title")}</h3>
            <p>{analysis.meta.summary}</p>
          </section>
        )}
        {analysis.critic.overall && (
          <section className="sec">
            <h3>{t("d.overall")}</h3>
            <span className="pill">{t(`overall.${analysis.critic.overall.verdict}`)}</span>
            <p>{analysis.critic.overall.note}</p>
          </section>
        )}
      </div>
    );
  }
  if (selected.kind === "hub" && selected.inference) {
    const inference = selected.inference;
    const review = analysis.critic.infReviews.find((item) => item.id === inference.id);
    const formalB = analysis.critic.formals.find((item) => item.inference === inference.id)?.formal ?? null;
    const objections = analysis.attacks.filter((attack) => attack.to === inference.id);
    const openLab = (formal: { premises: string[]; conclusion: string } | null, source: "A" | "B") => {
      if (formal) onOpenLab(formal.premises, formal.conclusion, inference.id, source);
    };
    return (
      <div className="panel detail" key={selected.id}>
        <div className="dhead"><span className="ntag">{t("d.step")} · {t(`it.${inference.type}`)}</span></div>
        <section className="sec">
          <h3>{t("d.from")}</h3>
          <ul className="plain">
            {inference.from.map((id) => {
              const claim = analysis.claims.find((item) => item.id === id);
              return <li key={id}><button className="linkbtn" type="button" onClick={() => onSelect(id)}>{claim?.text ?? id}</button></li>;
            })}
          </ul>
        </section>
        <section className="sec">
          <h3>{t("d.to")}</h3>
          <button className="linkbtn" type="button" onClick={() => onSelect(inference.to)}>
            {analysis.claims.find((item) => item.id === inference.to)?.text ?? inference.to}
          </button>
        </section>
        {!!objections.length && <section className="sec"><h3>{t("d.attackedBy")}</h3><ul className="plain">{objections.map((attack) => {
          const source = analysis.claims.find((item) => item.id === attack.from);
          return <li key={`${attack.from}-${attack.to}`}><button className="linkbtn" type="button" onClick={() => onSelect(attack.from)}>{source?.text ?? attack.from}</button></li>;
        })}</ul></section>}
        <section className="sec">
          <h3>{t("d.a1")}</h3>
          <span className="pill">{t(`str.${inference.strength}`)}</span>
          {inference.note && <p>{inference.note}</p>}
        </section>
        <section className="sec">
          <h3>{t("d.a2")}</h3>
          {review ? <><span className="pill">{t(`str.${review.strength}`)}</span>{review.note && <p>{review.note}</p>}</> : <span className="muted">…</span>}
        </section>
        <section className="sec">
          <h3>{t("d.engine")}</h3>
          <FormalBlock label={t("d.formalA")} formal={inference.formal} check={analysis.checks[inference.id]?.A} />
          <button className="btn ghost small" type="button" disabled={!inference.formal} onClick={() => openLab(inference.formal, "A")}>
            {t("d.openlab")}
          </button>
          {formalB && (
            <>
              <FormalBlock label={t("d.formalB")} formal={formalB} check={analysis.checks[inference.id]?.B} />
              <button className="btn ghost small" type="button" onClick={() => openLab(formalB, "B")}>{t("d.openlab")}</button>
            </>
          )}
        </section>
        {analysis.critic.fallacies.filter((item) => item.targets.includes(inference.id)).map((fallacy, index) => (
          <section className="fallacy" key={`${fallacy.name}-${index}`}>
            <div className="fhead"><strong>{fallacy.name}</strong><span>{t("d.sev", { n: fallacy.severity })}</span></div>
            {fallacy.quote && <blockquote>{fallacy.quote}</blockquote>}
            <p>{fallacy.explanation}</p>
          </section>
        ))}
      </div>
    );
  }

  const claim = selected.claim;
  if (!claim) return null;
  const role = selected.role ?? "premise";
  const review = role === "critic" ? null : analysis.critic.claimReviews.find((item) => item.id === claim.id);
  const targets = analysis.attacks.filter((attack) => attack.to === claim.id);
  const challenges = analysis.attacks.filter((attack) => attack.from === claim.id);
  return (
    <div className="panel detail" key={selected.id}>
      <div className="dhead"><span className={`ntag role-${role}`}>{t(`role.${role}`)}</span></div>
      <p className="claimtext">{claim.text}</p>
      {role === "assumption" && <p className="note">{t("d.hidden")}</p>}
      {role === "critic" && <p className="note">{t("d.missing")} ({t(`d.missing.${"kind" in claim ? claim.kind : "assumption"}`)})</p>}
      {"quote" in claim && claim.quote && <section className="sec"><h3>{t("d.quote")}</h3><blockquote>{claim.quote}</blockquote></section>}
      {review && (!review.roleOk || review.note) && (
        <section className="sec">
          <h3>{t("d.a2")}</h3>
          {review.suggestRole && review.suggestRole !== role && <span className="pill">{t("d.roleDispute", { r: t(`role.${review.suggestRole}`) })}</span>}
          {review.note && <p>{review.note}</p>}
        </section>
      )}
      {analysis.critic.fallacies.filter((item) => item.targets.includes(claim.id)).map((fallacy, index) => (
        <section className="fallacy" key={`${fallacy.name}-${index}`}>
          <div className="fhead"><strong>{fallacy.name}</strong><span>{t("d.sev", { n: fallacy.severity })}</span></div>
          <p>{fallacy.explanation}</p>
        </section>
      ))}
      {!!targets.length && <section className="sec"><h3>{t("d.attackedBy")}</h3><ul className="plain">{targets.map((attack) => {
        const source = analysis.claims.find((item) => item.id === attack.from);
        return <li key={`${attack.from}-${attack.to}`}><button className="linkbtn" type="button" onClick={() => onSelect(attack.from)}>{source?.text ?? attack.from}</button></li>;
      })}</ul></section>}
      {!!challenges.length && <section className="sec"><h3>{t("d.attack")}</h3><ul className="plain">{challenges.map((attack) => {
        const targetClaim = analysis.claims.find((item) => item.id === attack.to);
        const targetInference = analysis.infs.find((item) => item.id === attack.to);
        return <li key={`${attack.from}-${attack.to}`}>
          <button className="linkbtn" type="button" onClick={() => onSelect(attack.to)}>
            {targetClaim?.text ?? targetInference?.note ?? attack.to}
          </button>
          {attack.note && <div className="muted">{attack.note}</div>}
        </li>;
      })}</ul></section>}
    </div>
  );
}

export function ArgumentMapView({
  input,
  setInput,
  tier,
  setTier,
  analysis,
  saved,
  error,
  savingError,
  running,
  analyze,
  stop,
  open,
  remove,
  exportFile,
  onOpenLab,
  selectedNode,
  onSelectNode,
}: Props) {
  const { t, lang } = useI18n();
  const [showCritic, setShowCritic] = useState(true);
  const [showAssumptions, setShowAssumptions] = useState(true);
  const [zoom, setZoom] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const graph = useMemo(
    () => analysis ? layoutArgument(analysis, showCritic, showAssumptions) : null,
    [analysis, showAssumptions, showCritic],
  );
  const selected = graph?.nodes.find((node) => node.id === selectedNode);
  const fit = graph && viewportWidth
    ? Math.min(1, (viewportWidth - 24) / graph.width)
    : 1;
  const scale = zoom ?? fit;
  const active = running && analysis && ACTIVE_PHASES.has(analysis.phase);
  const findings = analysis
    ? analysis.critic.fallacies.length + analysis.critic.missing.length + analysis.critic.claimReviews.filter((item) => !item.roleOk).length
    : 0;
  const statusKey = analysis?.phase === "done" ? "st.done"
    : analysis?.phase === "stopped" ? "st.stopped"
      : analysis?.phase === "failed" ? "st.failed"
        : analysis?.phase === "a2" ? "st.a2"
          : analysis?.phase === "e1" || analysis?.phase === "e2" ? "ag.engine"
            : "st.a1";
  const phases = ["a1", "e1", "a2", "e2"];
  const phaseIndex = analysis ? phases.indexOf(analysis.phase) : -1;

  useEffect(() => {
    if (!analysis) return;
    const measure = () => setViewportWidth(viewport.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [Boolean(analysis)]);

  useEffect(() => {
    if (!analysis || !selectedNode) return;
    const criticNode = analysis.critic.missing.some((item) => item.id === selectedNode);
    const assumptionNode = analysis.claims.some((item) => item.id === selectedNode && item.role === "assumption");
    if (criticNode && !showCritic) setShowCritic(true);
    if (assumptionNode && !showAssumptions) setShowAssumptions(true);
  }, [analysis, selectedNode, showAssumptions, showCritic]);

  const changeZoom = (amount: number) => setZoom((current) => Math.max(0.35, Math.min(1.6, (current ?? fit) + amount)));
  const nodeAndEdges = (id: string) => {
    const linked = new Set<string>([id]);
    for (const edge of graph?.edges ?? []) {
      if (edge.from === id) linked.add(edge.to);
      if (edge.to === id) linked.add(edge.from);
    }
    return linked;
  };
  const highlighted = selectedNode ? nodeAndEdges(selectedNode) : null;

  return (
    <>
      <div className="panel">
        <h2>{t("map.title")}</h2>
        <p className="lead">{t("map.intro")}</p>
        <div className="mapinput">
          <div>
            <label className="f" htmlFor="map-text">{t("map.text")}</label>
            <textarea
              id="map-text"
              rows={7}
              maxLength={MAX_CHARS}
              value={input}
              disabled={running}
              placeholder={t("map.text.ph")}
              onChange={(event) => setInput(event.target.value)}
            />
            <p className="muted">{t("map.chars", { n: input.length.toLocaleString(lang === "nl" ? "nl-NL" : "en-GB") })}</p>
          </div>
          <div>
            <label className="f" htmlFor="map-example">{t("map.example")}</label>
            <select id="map-example" disabled={running} defaultValue="" onChange={(event) => {
              const example = MAP_EXAMPLES.find((item) => item.id === event.target.value);
              if (example) setInput(example.text[lang]);
            }}>
              <option value="">{t("map.example.pick")}</option>
              {MAP_EXAMPLES.map((example) => <option key={example.id} value={example.id}>{example.title[lang]}</option>)}
            </select>
            <label className="f" htmlFor="map-tier">{t("map.tier")}</label>
            <select id="map-tier" value={tier} disabled={running} onChange={(event) => {
              const value = event.target.value;
              if (value === "quick" || value === "default" || value === "complex") setTier(value);
            }}>
              {(["quick", "default", "complex"] as const).map((value) => (
                <option key={value} value={value}>{t(`tier.${value}`)}</option>
              ))}
            </select>
            <div className="row" style={{ marginTop: 14 }}>
              {running
                ? <button className="btn" type="button" onClick={stop}>{t("map.stop")}</button>
                : <button className="btn" type="button" onClick={() => { onSelectNode(null); void analyze(); }}>{t("map.analyze")}</button>}
              {analysis && <div className="exportbar">
                <button className="btn ghost small" type="button" onClick={() => void exportFile("markdown")}>{t("ex.md")}</button>
                <button className="btn ghost small" type="button" onClick={() => void exportFile("json")}>{t("ex.json")}</button>
              </div>}
            </div>
          </div>
        </div>
        {error && <p className="note" role="alert">{t(error)}</p>}
        {savingError && <p className="note" role="status">{t("sv.fail")}</p>}
        {analysis && (
          <div className={`status ${analysis.phase === "failed" ? "failed" : ""}`} aria-live="polite">
            <span className="steps">
              {[["a1", "ag.a1"], ["e1", "ag.engine"], ["a2", "ag.a2"], ["e2", "ag.engine"]].map(([phase, key], index) => (
                <span key={phase} className={`step ${analysis.phase === "done" || index < phaseIndex ? "done" : running && index === phaseIndex ? "active" : ""}`}>{t(key)}</span>
              ))}
            </span>
            <span className="smsg">{active && <span className="spin" aria-hidden="true" />} {t(statusKey)} · {t("st.counts", { c: analysis.claims.length, i: analysis.infs.length, f: findings })}</span>
            {analysis.warnings.map((warning, index) => <span className="note" key={`${warning}-${index}`}>{t(warning)}</span>)}
          </div>
        )}
      </div>

      {analysis && (
        <div className="maplayout">
          <div className="panel mappanel">
            <div className="maptools">
              <label className="tg"><input type="checkbox" checked={showCritic} onChange={(event) => setShowCritic(event.target.checked)} /> {t("tg.critic")}</label>
              <label className="tg"><input type="checkbox" checked={showAssumptions} onChange={(event) => setShowAssumptions(event.target.checked)} /> {t("tg.assume")}</label>
              <div className="zoom">
                <button className="btn ghost small" type="button" aria-label={t("zoom.out")} onClick={() => changeZoom(-0.1)}>−</button>
                <button className="btn ghost small" type="button" aria-label={t("zoom.in")} onClick={() => changeZoom(0.1)}>+</button>
                <button className="btn ghost small" type="button" onClick={() => setZoom(null)}>{t("zoom.fit")}</button>
              </div>
            </div>
            <div className="mapscroll" ref={viewport}>
              {!graph?.nodes.length ? <p className="empty">{t("map.noresult")}</p> : (
                <div className="sizer" style={{ width: graph.width * scale, height: graph.height * scale }}>
                  <div className="canvas" style={{ width: graph.width, height: graph.height, transform: `scale(${scale})` }}>
                    <svg className="edges" width={graph.width} height={graph.height} aria-hidden="true">
                      <defs>
                        <marker id="arrow-support" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--edge)" /></marker>
                        <marker id="arrow-attack" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--bad)" /></marker>
                        <marker id="arrow-critic" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--c-critic)" /></marker>
                      </defs>
                      {graph.edges.map((edge, index) => {
                        const from = graph.nodes.find((node) => node.id === edge.from);
                        const to = graph.nodes.find((node) => node.id === edge.to);
                        if (!from || !to) return null;
                        const mid = (from.y + to.y) / 2;
                        const dim = highlighted && !highlighted.has(edge.from) && !highlighted.has(edge.to);
                        const direction = Math.sign(to.y - from.y) || 1;
                        const startY = from.y + direction * from.height / 2;
                        const endY = to.y - direction * to.height / 2;
                        return <path key={`${edge.from}-${edge.to}-${index}`} className={`edge ${edge.kind} ${dim ? "dim" : ""}`} markerEnd={`url(#arrow-${edge.kind})`} d={`M ${from.x} ${startY} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${endY}`} />;
                      })}
                    </svg>
                    {graph.nodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        className={`mnode ${node.kind === "hub" ? "hub" : `role-${node.role}`} ${selectedNode === node.id ? "sel" : ""} ${highlighted && !highlighted.has(node.id) ? "dim" : ""}`}
                        style={{ left: node.x - node.width / 2, top: node.y - node.height / 2, width: node.width, height: node.height }}
                        aria-label={node.kind === "hub" ? `${t("d.step")}: ${node.id}` : node.claim?.text}
                        aria-pressed={selectedNode === node.id}
                        onClick={() => onSelectNode(selectedNode === node.id ? null : node.id)}
                      >
                        {node.kind === "hub" && node.inference
                          ? <><span className="ntag">{t(`it.${node.inference.type}`)}</span><span className="hglyph">→</span></>
                          : <><span className="ntag">{t(`role.${node.role ?? "premise"}`)}</span><span className="ntext">{node.claim?.text}</span></>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="legend">
              {(["premise", "intermediate", "conclusion", "assumption", "objection", "critic"] as const).map((role) =>
                <span className={`lg role-${role}`} key={role}>{t(`role.${role}`)}</span>,
              )}
            </div>
          </div>
          <NodeDetails
            analysis={analysis}
            selected={selected}
            onSelect={(id) => onSelectNode(id)}
            onOpenLab={onOpenLab}
          />
        </div>
      )}

      <section className="panel saved">
        <h3 className="subh">{t("sv.title")}</h3>
        {!saved.length ? <p className="muted">{t("sv.none")}</p> : (
          <ul className="plain">
            {saved.map((item) => (
              <li key={item.id}>
                <span className="stitle">{item.title || item.text.slice(0, 60)}</span>
                <span className="muted">{new Date(item.updated).toLocaleString(lang === "nl" ? "nl-NL" : "en-GB")}</span>
                <button className="btn ghost small" type="button" disabled={running} onClick={() => void open(item.id)}>{t("sv.open")}</button>
                <button className="btn ghost small" type="button" disabled={running} onClick={() => void remove(item.id)}>{t("sv.delete")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
