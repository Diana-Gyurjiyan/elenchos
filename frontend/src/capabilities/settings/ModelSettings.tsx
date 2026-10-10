import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { ModelChoice } from "../../types";
import { loadChoice, saveChoice } from "./modelChoice";

interface Value {
  choice: ModelChoice;
  setChoice: (patch: Partial<ModelChoice>) => void;
  /** Always the latest choice, for adapters that must not be re-created on every keystroke. */
  getChoice: () => ModelChoice;
}

const Ctx = createContext<Value | null>(null);

export function ModelSettingsProvider({ children }: { children: ReactNode }) {
  const [choice, setState] = useState<ModelChoice>(() => loadChoice());
  const ref = useRef(choice);
  ref.current = choice;

  const setChoice = useCallback((patch: Partial<ModelChoice>) => {
    const next = { ...ref.current, ...patch };
    ref.current = next;
    saveChoice(next);
    setState(next);
  }, []);
  const getChoice = useCallback(() => ref.current, []);

  const value = useMemo(() => ({ choice, setChoice, getChoice }), [choice, setChoice, getChoice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useModelSettings(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useModelSettings needs <ModelSettingsProvider>");
  return v;
}
