import { describe, expect, it } from "vitest";
import en from "./en.json";
import nl from "./nl.json";
import { detectLang, translate } from "./translate";

describe("i18n", () => {
  it("has the same keys in both catalogues", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(nl).sort());
  });
  it("interpolates and falls back to the key", () => {
    expect(translate("en", "v.invalid.fol", { n: 3 })).toContain("3");
    expect(translate("nl", "no.such.key")).toBe("no.such.key");
  });
  it("detects the language", () => {
    expect(detectLang(null, "nl-BE")).toBe("nl");
    expect(detectLang(null, "de-DE")).toBe("en");
    expect(detectLang("en", "nl-NL")).toBe("en");
  });
});
