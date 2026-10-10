import en from "./en.json";
import nl from "./nl.json";

export type Lang = "nl" | "en";
export type Vars = Record<string, string | number>;
export type Translate = (key: string, vars?: Vars) => string;
/** Every key that exists in the Dutch catalogue (English has the same set). */
export type MessageKey = keyof typeof nl;

const dict: Record<Lang, Record<string, string>> = { nl, en };

/** Falls back to English, then to the key itself, like the original `t()`. */
export function translate(lang: Lang, key: string, vars?: Vars): string {
  let s = dict[lang][key] ?? dict.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function detectLang(saved: string | null, navigatorLanguage: string | undefined): Lang {
  if (saved === "nl" || saved === "en") return saved;
  return /^nl/i.test(navigatorLanguage ?? "nl") ? "nl" : "en";
}

export const LOCALES: Record<Lang, string> = { nl: "nl-NL", en: "en-GB" };
