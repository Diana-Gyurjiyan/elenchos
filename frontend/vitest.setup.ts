// Components read translations through a hook; tests render them without a provider,
// so the hook is replaced by the Dutch catalogue.
import { vi } from "vitest";
import { translate } from "./src/i18n/translate";

vi.mock("./src/i18n/I18nProvider", () => ({
  useI18n: () => ({ lang: "nl", setLang: () => {}, t: (k: string, v?: Record<string, string | number>) => translate("nl", k, v) }),
}));
