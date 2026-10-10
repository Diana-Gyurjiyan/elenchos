import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCapability } from "../CapabilityProvider";
import { CapabilityError, type Doc, type LogicPort } from "../../types";
import { translate, type Lang } from "../../i18n/translate";
import { buildPromptA, buildPromptB } from "./prompts";
import { extractJsonObjects } from "./streamParser";
import { createAnalysis, normalizeAgentA, normalizeAgentB } from "./normalize";
import { packAnalysis, restoreAnalysis, type Analysis, type AnalysisTier, type SavedAnalysis } from "./types";
import { disagreementCount } from "./disagreements";
import { analysisJson, analysisMarkdown as buildMarkdown } from "./export";

const MAX_CHARS = 20_000;
const COLLECTION = "analyses";

function savedFromDoc(doc: Doc): SavedAnalysis | null {
  if (
    doc.kind !== "analysis" ||
    typeof doc.id !== "string" ||
    typeof doc.text !== "string" ||
    typeof doc.created !== "number" ||
    !Array.isArray(doc.claims) ||
    !Array.isArray(doc.infs) ||
    !Array.isArray(doc.attacks)
  ) return null;
  return doc as unknown as SavedAnalysis;
}

function checkFormals(analysis: Analysis, side: "A" | "B", checkArgument: LogicPort["checkArgument"]) {
  const formals =
    side === "A"
      ? analysis.infs.map((inference) => ({ id: inference.id, formal: inference.formal }))
      : analysis.critic.formals.map(({ inference, formal }) => ({ id: inference, formal }));
  for (const { id, formal } of formals) {
    if (!formal) continue;
    analysis.checks[id] = { ...analysis.checks[id], [side]: checkArgument(formal.premises, formal.conclusion) };
  }
}

export function useAnalysis(lang: Lang) {
  const sample = useCapability("sample");
  const store = useCapability("store");
  const logic = useCapability("logic");
  const downloads = useCapability("downloads");
  const [input, setInput] = useState("");
  const [tier, setTier] = useState<AnalysisTier>("default");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [saved, setSaved] = useState<SavedAnalysis[]>([]);
  const [error, setError] = useState("");
  const [savingError, setSavingError] = useState(false);
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const currentAnalysis = useRef<Analysis | null>(null);
  const collection = useMemo(() => store?.collection(COLLECTION), [store]);

  const publish = useCallback((next: Analysis) => {
    currentAnalysis.current = next;
    setAnalysis({ ...next, claims: [...next.claims], infs: [...next.infs], attacks: [...next.attacks] });
  }, []);

  const refreshSaved = useCallback(async () => {
    if (!collection) return;
    const docs = await collection.list({ orderBy: "updated", desc: true, limit: 25 });
    setSaved(docs.map(savedFromDoc).filter((item): item is SavedAnalysis => item !== null));
  }, [collection]);

  useEffect(() => {
    void refreshSaved().catch(() => setSavingError(true));
  }, [refreshSaved]);

  const persist = useCallback(async (item: Analysis) => {
    if (!collection) return;
    try {
      const packed = packAnalysis(item);
      await collection.set(packed.id, { ...packed });
      setSavingError(false);
      await refreshSaved();
    } catch {
      setSavingError(true);
    }
  }, [collection, refreshSaved]);

  const analyze = useCallback(async (source = input, selectedTier = tier) => {
    if (!sample || !logic) {
      setError("map.nosample");
      return;
    }
    const text = source.trim().slice(0, MAX_CHARS);
    if (!text) {
      setError("map.inputRequired");
      return;
    }
    if (controller.current) return;
    const ctl = new AbortController();
    controller.current = ctl;
    setRunning(true);
    setError("");
    setSavingError(false);
    const next = createAnalysis(text, lang, selectedTier);
    next.phase = "a1";
    publish(next);
    setInput(text);

    const consume = async (
      prompt: string,
      phase: "a1" | "a2",
      normalize: (target: Analysis, item: Record<string, unknown>) => void,
    ) => {
      let buffer = "";
      let cursor = 0;
      const result = await sample(prompt, {
        signal: ctl.signal,
        onText: ({ text: chunk }) => {
          buffer += chunk;
          const parsed = extractJsonObjects(buffer, cursor);
          cursor = parsed.end;
          for (const object of parsed.objects) normalize(next, object);
          next.phase = phase;
          next.updated = Date.now();
          publish(next);
        },
      });
      if (result.truncated && !next.warnings.includes("er.partial")) next.warnings.push("er.partial");
    };

    try {
      await consume(
        buildPromptA(text, lang, selectedTier),
        "a1",
        (target, item) => normalizeAgentA(target, item, selectedTier),
      );
      if (!next.claims.length || !next.infs.length) throw new Error("analysis.empty");
      next.phase = "e1";
      checkFormals(next, "A", logic.checkArgument);
      publish(next);
      await persist(next);
      if (!ctl.signal.aborted) {
        next.phase = "a2";
        publish(next);
        await consume(
          buildPromptB(next, lang, selectedTier),
          "a2",
          (target, item) => normalizeAgentB(target, item, selectedTier),
        );
        next.phase = "e2";
        checkFormals(next, "B", logic.checkArgument);
        publish(next);
        await persist(next);
        next.phase = "done";
        next.updated = Date.now();
        publish(next);
        await persist(next);
      } else {
        next.phase = "stopped";
        publish(next);
        await persist(next);
      }
    } catch (reason) {
      if (ctl.signal.aborted || (reason instanceof Error && reason.message === "cancelled")) {
        next.phase = "stopped";
        publish(next);
        await persist(next);
      } else {
        next.phase = "failed";
        publish(next);
        setError(reason instanceof Error && reason.message === "analysis.empty"
          ? "er.noclaims"
          : reason instanceof CapabilityError
            ? `er.${reason.code}`
            : "map.analysisFailed");
        await persist(next);
      }
    } finally {
      controller.current = null;
      setRunning(false);
    }
  }, [input, lang, logic, persist, publish, sample, tier]);

  const stop = useCallback(() => controller.current?.abort(), []);

  const open = useCallback(async (id: string) => {
    if (!collection || !logic) return;
    try {
      const doc = await collection.get(id);
      const item = doc && savedFromDoc(doc);
      if (!item) {
        setError("sv.loadFailed");
        return;
      }
      const restored = restoreAnalysis(item);
      checkFormals(restored, "A", logic.checkArgument);
      checkFormals(restored, "B", logic.checkArgument);
      publish(restored);
      setInput(restored.text);
      setTier(restored.tier);
      setError("");
    } catch {
      setError("sv.loadFailed");
    }
  }, [collection, logic, publish]);

  const remove = useCallback(async (id: string) => {
    if (!collection) return;
    setError("");
    try {
      await collection.delete(id);
      await refreshSaved();
      if (currentAnalysis.current?.id === id) {
        currentAnalysis.current = null;
        setAnalysis(null);
      }
    } catch {
      setError("sv.deleteFailed");
    }
  }, [collection, refreshSaved]);

  const exportFile = useCallback(async (kind: "json" | "markdown") => {
    if (!analysis || !downloads) return;
    setError("");
    try {
      const title = (analysis.meta?.title || "argument-analysis").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "");
      const data = kind === "json"
        ? analysisJson(analysis)
        : buildMarkdown(analysis, (key, vars) => translate(lang, key, vars));
      await downloads.save({
        filename: `${title || "argument-analysis"}.${kind === "json" ? "json" : "md"}`,
        data,
        mime: kind === "json" ? "application/json" : "text/markdown",
      });
      setError("");
    } catch {
      setError("ex.failed");
    }
  }, [analysis, downloads, lang]);

  return {
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
    conflictCount: analysis ? disagreementCount(analysis) : 0,
  };
}
