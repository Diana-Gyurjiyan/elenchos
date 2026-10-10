import type { CheckResult, CheckSuccess } from "./engine";
import type { Translate } from "../../i18n/translate";

export interface VerdictParts {
  cls: "ok" | "bad" | "warn" | "info";
  big: string;
  sub: string;
  glyph: string;
}

/** Headline, explanation and glyph for an engine result (shared by the lab and the map). */
export function verdictParts(r: CheckSuccess, t: Translate): VerdictParts {
  const n = r.maxSize;
  switch (r.status) {
    case "valid":
      if (r.logic === "prop" && r.vacuous) {
        return { cls: "warn", big: t("v.vacuous"), sub: t("v.vacuous.sub"), glyph: "≈" };
      }
      return { cls: "ok", big: t("v.valid"), sub: t("v.valid.sub"), glyph: "✓" };
    case "invalid":
      return {
        cls: "bad",
        big: t("v.invalid"),
        sub: r.logic === "prop" ? t("v.invalid.prop") : t("v.invalid.fol", { n: r.counterSize ?? "" }),
        glyph: "✗",
      };
    case "valid_bounded":
      return { cls: "info", big: t("v.valid_bounded"), sub: t("v.valid_bounded.sub", { n: n ?? "" }), glyph: "≲" };
    case "vacuous_bounded":
      return {
        cls: "warn",
        big: t("v.vacuous_bounded", { n: n ?? "" }),
        sub: t("v.vacuous_bounded.sub", { n: n ?? "" }),
        glyph: "≈",
      };
    case "satisfiable":
      return { cls: "ok", big: t("v.satisfiable"), sub: t("v.satisfiable.sub"), glyph: "✓" };
    case "unsatisfiable":
      return { cls: "bad", big: t("v.unsatisfiable"), sub: t("v.unsatisfiable.sub"), glyph: "✗" };
    case "unsat_bounded":
      return {
        cls: "bad",
        big: t("v.unsat_bounded", { n: n ?? "" }),
        sub: t("v.unsat_bounded.sub", { n: n ?? "" }),
        glyph: "✗",
      };
    default:
      return { cls: "warn", big: t("v.unknown"), sub: t("v.unknown.sub"), glyph: "?" };
  }
}

/** Compact badge for map nodes. */
export function engineBadge(r: CheckResult | null | undefined, t: Translate) {
  if (!r) return null;
  if (!r.ok) return { glyph: "!", cls: "warn" as const, title: t("d.unreadable") };
  const v = verdictParts(r, t);
  return { glyph: v.glyph, cls: v.cls, title: v.big };
}
