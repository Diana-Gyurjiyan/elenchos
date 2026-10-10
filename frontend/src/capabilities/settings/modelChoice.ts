import type { ModelChoice } from "../../types";

const KEY = "argmap.model";

/** Ollama is the default provider. */
export const DEFAULT_CHOICE: ModelChoice = { provider: "ollama", model: "", apiKey: "" };

export function loadChoice(
  storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage(),
): ModelChoice {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return DEFAULT_CHOICE;
    const o = JSON.parse(raw) as Partial<ModelChoice>;
    return {
      provider: typeof o.provider === "string" && o.provider ? o.provider : DEFAULT_CHOICE.provider,
      model: typeof o.model === "string" ? o.model : "",
      apiKey: typeof o.apiKey === "string" ? o.apiKey : "",
    };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function saveChoice(c: ModelChoice, storage: Pick<Storage, "setItem"> | null = safeStorage()) {
  try {
    storage?.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private mode or quota: the choice then lives for this session only */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
