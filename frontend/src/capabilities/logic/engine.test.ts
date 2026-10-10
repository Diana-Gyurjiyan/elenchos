import { describe, expect, it } from "vitest";
import { analyzeFormula, checkArgument, equivalent, type CheckSuccess } from "./engine";

function ok(r: ReturnType<typeof checkArgument>): CheckSuccess {
  if (!r.ok) throw new Error("expected ok, got " + JSON.stringify(r.errors));
  return r;
}

describe("propositional", () => {
  it("modus ponens is valid and recognised", () => {
    const r = ok(checkArgument(["P → Q", "P"], "Q"));
    expect(r.status).toBe("valid");
    expect(r.form?.id).toBe("modus_ponens");
  });

  it("affirming the consequent is invalid, with a counterexample and repairs", () => {
    const r = ok(checkArgument(["Regen → Nat", "Nat"], "Regen"));
    expect(r.status).toBe("invalid");
    if (r.logic !== "prop") throw new Error("prop expected");
    expect(r.counterexamples[0]).toEqual({ Nat: true, Regen: false });
    expect(r.form?.valid).toBe(false);
    expect(r.repairs.length).toBeGreaterThan(0);
  });

  it("inconsistent premises make any conclusion vacuously valid", () => {
    const r = ok(checkArgument(["P → Q", "P", "¬Q"], "R"));
    expect(r.status).toBe("valid");
    if (r.logic !== "prop") throw new Error("prop expected");
    expect(r.vacuous).toBe(true);
    expect(r.inconsistentCore?.length).toBeGreaterThan(0);
  });

  it("ASCII and unicode syntax agree", () => {
    const e = equivalent("P -> Q", "!P | Q");
    expect(e.equivalent).toBe(true);
    expect(analyzeFormula("P | !P").kind).toBe("tautology");
    expect(analyzeFormula("P & !P").kind).toBe("contradiction");
  });
});

describe("first order", () => {
  it("Socrates: no countermodel up to the bound", () => {
    const r = ok(checkArgument(["∀x (Mens(x) → Sterfelijk(x))", "Mens(socrates)"], "Sterfelijk(socrates)"));
    expect(r.logic).toBe("fol");
    expect(r.status).toBe("valid_bounded");
  });

  it("quantifier shift is refuted by a finite model", () => {
    const r = ok(checkArgument(["∀x ∃y Houdt_van(x, y)"], "∃y ∀x Houdt_van(x, y)"));
    expect(r.status).toBe("invalid");
    if (r.logic !== "fol") throw new Error("fol expected");
    expect(r.counterModel?.size).toBeGreaterThanOrEqual(2);
  });

  it("existential import: the empty-predicate note is produced", () => {
    const r = ok(
      checkArgument(
        ["∀x (Eenhoorn(x) → Magisch(x))", "∀x (Magisch(x) → Zeldzaam(x))"],
        "∃x (Eenhoorn(x) ∧ Zeldzaam(x))",
      ),
    );
    expect(r.status).toBe("invalid");
    if (r.logic !== "fol") throw new Error("fol expected");
    expect(r.emptyPredicates).toContain("Eenhoorn");
  });
});

describe("errors", () => {
  it("reports syntax errors with the premise index and position", () => {
    const r = checkArgument(["P ∧"], "Q");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ where: "premise", index: 0 });
    expect(typeof r.errors[0].pos).toBe("number");
  });

  it("refuses quantifiers in forced propositional mode", () => {
    const r = checkArgument(["∀x P(x)"], "P(a)", { mode: "prop" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("mode");
  });

  it("an empty input is an error, not a crash", () => {
    expect(checkArgument([], "").ok).toBe(false);
  });
});
