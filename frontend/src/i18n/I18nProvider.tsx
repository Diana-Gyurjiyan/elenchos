import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { detectLang, translate, type Lang, type Translate } from "./translate";

interface Value {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
}
const Ctx = createContext<Value | null>(null);
const KEY = "argmap.lang";

function initialLang(): Lang {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* storage blocked: fall back to the browser language */
  }
  return detectLang(saved, typeof navigator === "undefined" ? undefined : navigator.language);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const t = useCallback<Translate>((key, vars) => translate(lang, key, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n needs <I18nProvider>");
  return v;
}
