from __future__ import annotations

from app.capabilities.logic import analyze_formula, check_argument, equivalent


def test_modus_ponens_and_truth_table() -> None:
    result = check_argument(["P → Q", "P"], "Q")

    assert result["ok"] is True
    assert result["status"] == "valid"
    assert result["form"]["id"] == "modus_ponens"
    assert result["logic"] == result["mode"] == "prop"
    assert result["table"]["atoms"] == ["P", "Q"]
    assert len(result["table"]["rows"]) == 4
    assert not result["counterexamples"]


def test_invalid_propositional_argument_has_exact_counterexample_and_repair() -> None:
    result = check_argument(["Regen → Nat", "Nat"], "Regen")

    assert result["status"] == "invalid"
    assert result["counterexamples"][0] == {"Nat": True, "Regen": False}
    assert result["form"]["id"] == "affirming_consequent"
    assert result["form"]["valid"] is False
    assert result["repairs"]


def test_inconsistent_premises_are_vacuously_valid() -> None:
    result = check_argument(["P → Q", "P", "¬Q"], "R")

    assert result["status"] == "valid"
    assert result["vacuous"] is True
    assert result["premisesConsistent"] is False
    assert result["inconsistentCore"] == [0, 1, 2]


def test_ascii_unicode_and_formula_helpers() -> None:
    assert equivalent("P -> Q", "!P | Q")["equivalent"] is True
    assert analyze_formula("P | !P")["kind"] == "tautology"
    assert analyze_formula("P & !P")["kind"] == "contradiction"


def test_fol_finite_model_validity_and_countermodel() -> None:
    valid = check_argument(
        ["∀x (Mens(x) → Sterfelijk(x))", "Mens(socrates)"],
        "Sterfelijk(socrates)",
        {"repairs": False},
    )
    assert valid["logic"] == "fol"
    assert valid["status"] == "valid_bounded"
    assert valid["checkedTo"] == 4

    invalid = check_argument(
        ["∀x ∃y Houdt_van(x, y)"],
        "∃y ∀x Houdt_van(x, y)",
        {"repairs": False},
    )
    assert invalid["status"] == "invalid"
    assert invalid["counterSize"] >= 2
    assert invalid["counterModel"]["size"] == invalid["counterSize"]


def test_fol_countermodel_reports_empty_unary_predicates() -> None:
    result = check_argument(
        ["∀x (Eenhoorn(x) → Magisch(x))", "∀x (Magisch(x) → Zeldzaam(x))"],
        "∃x (Eenhoorn(x) ∧ Zeldzaam(x))",
    )

    assert result["status"] == "invalid"
    assert "Eenhoorn" in result["emptyPredicates"]
    assert result["counterModel"]["size"] >= 1
    assert result["repairs"][0]["kind"] == "existential_import"


def test_parser_errors_and_forced_mode_are_structured() -> None:
    syntax = check_argument(["", "P ∧"], "Q")
    assert syntax["ok"] is False
    assert syntax["errors"][0]["where"] == "premise"
    assert syntax["errors"][0]["index"] == 0
    assert syntax["errors"][0]["pos"] == 3
    assert syntax["errors"][0]["code"] == "syntax"

    forced = check_argument(["∀x P(x)"], "P(a)", {"mode": "prop"})
    assert forced["errors"][0]["code"] == "mode"
    assert check_argument([], "")["errors"][0]["code"] == "empty"


def test_first_order_arity_and_input_complexity_errors() -> None:
    arity = check_argument(["∀x P(x)", "P(a, b)"], "Q(a)", {"repairs": False})
    assert arity["ok"] is False
    assert arity["errors"][0]["code"] == "arity"

    deep = check_argument(["!" * 130 + "P"], "Q")
    assert deep["ok"] is False
    assert deep["errors"][0]["code"] == "size"

    too_many_atoms = check_argument([], " | ".join(f"P{i}" for i in range(21)))
    assert too_many_atoms["ok"] is False
    assert too_many_atoms["errors"][0]["code"] == "size"

    bounded = check_argument(["∀x P(x)"], "∀x P(x)", {"maxSize": 99, "repairs": False})
    assert bounded["status"] == "valid_bounded"
    assert bounded["maxSize"] == 6
