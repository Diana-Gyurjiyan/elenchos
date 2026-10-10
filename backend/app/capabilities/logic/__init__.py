"""Dependency-free propositional and bounded first-order logic engine.

The public ``check_argument`` result follows the JSON shape of the frontend
logic engine. Propositional checks are exhaustive; first-order checks search
finite domains and report bounded validity rather than claiming a proof.
"""

from __future__ import annotations

import itertools
import re
import time
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

MAX_PROP_ATOMS = 20
MAX_PREMISES = 30
MAX_FORMULA_LENGTH = 10_000
MAX_TOKENS = 2_048
MAX_PARSE_DEPTH = 128
MAX_FOL_CONSTANTS = 8
MAX_GROUND_NODES = 100_000
MAX_CONSTANT_ASSIGNMENTS = 50_000
MAX_CNF_CLAUSES = 100_000


class LogicError(ValueError):
    """A syntax, mode, or bounded-size error raised by the logic engine."""

    def __init__(self, message: str, pos: int | None = None, code: str = "syntax") -> None:
        super().__init__(message)
        self.pos = pos
        self.code = code


class _BudgetError(Exception):
    pass


_KEYWORDS = {
    "and": "and",
    "or": "or",
    "not": "not",
    "implies": "imp",
    "iff": "iff",
    "forall": "all",
    "exists": "ex",
    "true": "top",
    "false": "bot",
}
_OPS = (
    ("iff", re.compile(r"<->|<=>|↔|⇔|≡")),
    ("imp", re.compile(r"->|=>|→|⇒|⊃")),
    ("neq", re.compile(r"≠|!=")),
    ("and", re.compile(r"&&|&|∧|/\\|\^")),
    ("or", re.compile(r"\|\||\||∨|\\/")),
    ("not", re.compile(r"¬|!|~|-")),
    ("eq", re.compile(r"=")),
    ("all", re.compile(r"∀")),
    ("ex", re.compile(r"∃")),
    ("top", re.compile(r"⊤")),
    ("bot", re.compile(r"⊥")),
    ("lp", re.compile(r"[\(\[]")),
    ("rp", re.compile(r"[\)\]]")),
    ("comma", re.compile(r",")),
    ("dot", re.compile(r"[.:]")),
)
_ID_RE = re.compile(r"[A-Za-z_À-ɏͰ-Ͽ][A-Za-z0-9_'₀-₉À-ɏͰ-Ͽ]*")


def _tokenize(src: str) -> list[dict[str, Any]]:
    if len(src) > MAX_FORMULA_LENGTH:
        raise LogicError(f"Formula is too long (max {MAX_FORMULA_LENGTH} characters)", None, "size")
    tokens: list[dict[str, Any]] = []
    i = 0
    while i < len(src):
        if src[i].isspace():
            i += 1
            continue
        for kind, pattern in _OPS:
            match = pattern.match(src, i)
            if match:
                tokens.append({"t": kind, "v": match.group(), "pos": i})
                i = match.end()
                break
        else:
            match = _ID_RE.match(src, i)
            if not match:
                raise LogicError(f"Unexpected character '{src[i]}'", i, "char")
            value = match.group()
            tokens.append({"t": _KEYWORDS.get(value, "id"), "v": value, "pos": i})
            i = match.end()
        if len(tokens) > MAX_TOKENS:
            raise LogicError(f"Formula has too many tokens (max {MAX_TOKENS})", None, "size")
    return tokens


def parse(src: str) -> dict[str, Any]:
    """Parse a formula into the frontend-compatible internal AST."""
    text = str(src)
    tokens = _tokenize(text)
    p = 0
    recursion_depth = 0

    def peek() -> dict[str, Any] | None:
        return tokens[p] if p < len(tokens) else None

    def next_token() -> dict[str, Any] | None:
        nonlocal p
        if p >= len(tokens):
            return None
        token = tokens[p]
        p += 1
        return token

    def error(message: str, token: dict[str, Any] | None = None, code: str = "syntax") -> None:
        raise LogicError(message, token["pos"] if token else len(text), code)

    def expect(kind: str, what: str | None = None) -> dict[str, Any]:
        token = next_token()
        if token is None or token["t"] != kind:
            suffix = f", found '{token['v']}'" if token else " at end of formula"
            error(f"Expected {what or kind}{suffix}", token)
        return token

    def term(bound: set[str]) -> dict[str, str]:
        token = expect("id", "a name")
        if peek() and peek()["t"] == "lp":
            error(
                "Function symbols are not supported; use a predicate "
                "(e.g. Father(x, y)) instead",
                peek(),
                "function",
            )
        return {"k": "var" if token["v"] in bound else "const", "name": token["v"]}

    def p_iff(bound: set[str]) -> dict[str, Any]:
        left = p_imp(bound)
        while peek() and peek()["t"] == "iff":
            next_token()
            left = {"t": "iff", "a": left, "b": p_imp(bound)}
        return left

    def p_imp(bound: set[str]) -> dict[str, Any]:
        operands = [p_or(bound)]
        while peek() and peek()["t"] == "imp":
            next_token()
            operands.append(p_or(bound))
        result = operands[-1]
        for left in reversed(operands[:-1]):
            result = {"t": "imp", "a": left, "b": result}
        return result

    def p_or(bound: set[str]) -> dict[str, Any]:
        left = p_and(bound)
        while peek() and peek()["t"] == "or":
            next_token()
            left = {"t": "or", "a": left, "b": p_and(bound)}
        return left

    def p_and(bound: set[str]) -> dict[str, Any]:
        left = p_un(bound)
        while peek() and peek()["t"] == "and":
            next_token()
            left = {"t": "and", "a": left, "b": p_un(bound)}
        return left

    def p_un(bound: set[str]) -> dict[str, Any]:
        nonlocal recursion_depth
        recursion_depth += 1
        if recursion_depth > MAX_PARSE_DEPTH:
            recursion_depth -= 1
            raise LogicError(f"Formula nesting exceeds the limit ({MAX_PARSE_DEPTH})", None, "size")
        try:
            token = peek()
            if token is None:
                error("Unexpected end of formula")
            if token["t"] == "not":
                next_token()
                return {"t": "not", "f": p_un(bound)}
            if token["t"] in ("all", "ex"):
                next_token()
                variables = [expect("id", "a variable name")["v"]]
                while peek() and peek()["t"] == "comma":
                    next_token()
                    variables.append(expect("id", "a variable name")["v"])
                wide = bool(peek() and peek()["t"] == "dot")
                if wide:
                    next_token()
                new_bound = bound.union(variables)
                body = p_iff(new_bound) if wide else p_un(new_bound)
                for variable in reversed(variables):
                    body = {"t": token["t"], "v": variable, "f": body}
                return body
            return p_primary(bound)
        finally:
            recursion_depth -= 1

    def p_primary(bound: set[str]) -> dict[str, Any]:
        token = next_token()
        if token is None:
            error("Unexpected end of formula")
        if token["t"] == "lp":
            formula = p_iff(bound)
            expect("rp", "')'")
            return formula
        if token["t"] == "top":
            return {"t": "top"}
        if token["t"] == "bot":
            return {"t": "bot"}
        if token["t"] == "id":
            following = peek()
            if following and following["t"] == "lp":
                next_token()
                args = []
                if peek() and peek()["t"] != "rp":
                    args.append(term(bound))
                    while peek() and peek()["t"] == "comma":
                        next_token()
                        args.append(term(bound))
                expect("rp", "')'")
                if peek() and peek()["t"] in ("eq", "neq"):
                    error(
                        "Function symbols are not supported; use a predicate "
                        "(e.g. Father(x, y)) instead",
                        peek(),
                        "function",
                    )
                return {"t": "atom", "name": token["v"], "args": args}
            if following and following["t"] in ("eq", "neq"):
                next_token()
                equality = {
                    "t": "eq",
                    "a": {"k": "var" if token["v"] in bound else "const", "name": token["v"]},
                    "b": term(bound),
                }
                return {"t": "not", "f": equality} if following["t"] == "neq" else equality
            if token["v"] in bound:
                error(f"Variable '{token['v']}' cannot stand alone as a proposition", token)
            return {"t": "atom", "name": token["v"], "args": []}
        error(f"Unexpected '{token['v']}'", token)
        raise AssertionError("unreachable")

    if not tokens:
        raise LogicError("Empty formula", 0, "empty")
    formula = p_iff(set())
    if p < len(tokens):
        error(f"Unexpected '{tokens[p]['v']}'", tokens[p])

    # Long left-associative expressions are parsed iteratively, so also bound the
    # resulting AST depth before later recursive transformations.
    stack: list[tuple[dict[str, Any], int]] = [(formula, 1)]
    while stack:
        node, depth = stack.pop()
        if depth > MAX_PARSE_DEPTH:
            raise LogicError(f"Formula nesting exceeds the limit ({MAX_PARSE_DEPTH})", None, "size")
        if node["t"] in ("not", "all", "ex"):
            stack.append((node["f"], depth + 1))
        elif node["t"] in ("and", "or", "imp", "iff"):
            stack.append((node["a"], depth + 1))
            stack.append((node["b"], depth + 1))
    return formula


def _term_str(term_node: Mapping[str, Any]) -> str:
    return str(term_node["name"])


def show(formula: Mapping[str, Any], ctx: int = 0) -> str:
    def wrap(precedence: int, text: str) -> str:
        return f"({text})" if precedence < ctx else text

    kind = formula["t"]
    if kind == "top":
        return "⊤"
    if kind == "bot":
        return "⊥"
    if kind == "atom":
        args = formula["args"]
        return f"{formula['name']}({', '.join(map(_term_str, args))})" if args else formula["name"]
    if kind == "eq":
        return f"{_term_str(formula['a'])} = {_term_str(formula['b'])}"
    if kind == "not":
        child = formula["f"]
        if child["t"] == "eq":
            return f"{_term_str(child['a'])} ≠ {_term_str(child['b'])}"
        return "¬" + show(child, 5)
    if kind in ("all", "ex"):
        quantifier = "∀" if kind == "all" else "∃"
        return wrap(5, f"{quantifier}{formula['v']} {show(formula['f'], 5)}")
    if kind == "and":
        return wrap(4, f"{show(formula['a'], 4)} ∧ {show(formula['b'], 5)}")
    if kind == "or":
        return wrap(3, f"{show(formula['a'], 3)} ∨ {show(formula['b'], 4)}")
    if kind == "imp":
        return wrap(2, f"{show(formula['a'], 3)} → {show(formula['b'], 2)}")
    if kind == "iff":
        return wrap(1, f"{show(formula['a'], 2)} ↔ {show(formula['b'], 2)}")
    raise ValueError(f"bad node {kind}")


def _scan(asts: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    predicates: dict[str, set[int]] = {}
    constants: set[str] = set()
    quantifier = False
    equality = False
    stack = list(asts)
    while stack:
        formula = stack.pop()
        kind = formula["t"]
        if kind == "atom":
            predicates.setdefault(formula["name"], set()).add(len(formula["args"]))
            constants.update(arg["name"] for arg in formula["args"] if arg["k"] == "const")
        elif kind == "eq":
            equality = True
            constants.update(
                term_node["name"]
                for term_node in (formula["a"], formula["b"])
                if term_node["k"] == "const"
            )
        elif kind == "not":
            stack.append(formula["f"])
        elif kind in ("all", "ex"):
            quantifier = True
            stack.append(formula["f"])
        elif kind in ("and", "or", "imp", "iff"):
            stack.append(formula["b"])
            stack.append(formula["a"])
    return {"preds": predicates, "consts": constants, "quant": quantifier, "eq": equality}


def classify(asts: Iterable[Mapping[str, Any]]) -> str:
    info = _scan(asts)
    return "fol" if info["quant"] or info["eq"] else "prop"


def _collect_atoms(formula: Mapping[str, Any], atoms: set[str]) -> None:
    stack = [formula]
    while stack:
        node = stack.pop()
        if node["t"] == "atom":
            atoms.add(show(node))
        elif node["t"] == "not":
            stack.append(node["f"])
        elif node["t"] in ("and", "or", "imp", "iff"):
            stack.extend((node["a"], node["b"]))


def _truth_mask(formula: Mapping[str, Any], atom_indexes: Mapping[str, int], atom_count: int) -> int:
    rows = 1 << atom_count
    universe = (1 << rows) - 1

    def evaluate(node: Mapping[str, Any]) -> int:
        kind = node["t"]
        if kind == "top":
            return universe
        if kind == "bot":
            return 0
        if kind == "atom":
            index = atom_indexes[show(node)]
            block = 1 << index
            repeated = universe // ((1 << (2 * block)) - 1)
            return repeated * (((1 << block) - 1) << block)
        if kind == "not":
            return universe ^ evaluate(node["f"])
        if kind == "and":
            return evaluate(node["a"]) & evaluate(node["b"])
        if kind == "or":
            return evaluate(node["a"]) | evaluate(node["b"])
        if kind == "imp":
            return (universe ^ evaluate(node["a"])) | evaluate(node["b"])
        if kind == "iff":
            left, right = evaluate(node["a"]), evaluate(node["b"])
            return universe ^ (left ^ right)
        raise LogicError("Quantifiers or equality in propositional mode", None, "mode")

    return evaluate(formula)


def _prop_core(
    premises: Sequence[Mapping[str, Any]], conclusion: Mapping[str, Any] | None
) -> dict[str, Any]:
    atom_set: set[str] = set()
    for formula in premises:
        _collect_atoms(formula, atom_set)
    if conclusion is not None:
        _collect_atoms(conclusion, atom_set)
    atoms = sorted(atom_set)
    if len(atoms) > MAX_PROP_ATOMS:
        raise LogicError(
            f"Too many propositional atoms ({len(atoms)} > {MAX_PROP_ATOMS})", None, "size"
        )
    if len(premises) > MAX_PREMISES:
        raise LogicError(f"Too many premises (max {MAX_PREMISES})", None, "size")
    indexes = {atom: index for index, atom in enumerate(atoms)}
    premise_masks = [_truth_mask(formula, indexes, len(atoms)) for formula in premises]
    conclusion_mask = (
        _truth_mask(conclusion, indexes, len(atoms)) if conclusion is not None else 0
    )
    rows = 1 << len(atoms)
    return {
        "atoms": atoms,
        "N": rows,
        "universe": (1 << rows) - 1,
        "premise_masks": premise_masks,
        "conclusion_mask": conclusion_mask,
        "full": (1 << len(premises)) - 1,
    }


def _subset_mask(core: Mapping[str, Any], subset: int) -> int:
    satisfying = core["universe"]
    for index, mask in enumerate(core["premise_masks"]):
        if (subset >> index) & 1:
            satisfying &= mask
            if not satisfying:
                break
    return satisfying


def _core_valid(core: Mapping[str, Any], subset: int) -> bool:
    return not (_subset_mask(core, subset) & (core["universe"] ^ core["conclusion_mask"]))


def _core_sat(core: Mapping[str, Any], subset: int) -> bool:
    return bool(_subset_mask(core, subset))


def _valuation(atoms: Sequence[str], mask: int) -> dict[str, bool]:
    return {atom: bool((mask >> i) & 1) for i, atom in enumerate(atoms)}


_META = {"A", "B", "C", "D"}
_FORM_DEFS_RAW = [
    ("modus_ponens", "Modus ponens", "Modus ponens", True, ["A -> B", "A"], "B"),
    ("modus_tollens", "Modus tollens", "Modus tollens", True, ["A -> B", "¬B"], "¬A"),
    (
        "hypothetical_syllogism",
        "Hypothetical syllogism",
        "Hypothetisch syllogisme",
        True,
        ["A -> B", "B -> C"],
        "A -> C",
    ),
    (
        "disjunctive_syllogism",
        "Disjunctive syllogism",
        "Disjunctief syllogisme",
        True,
        ["A ∨ B", "¬A"],
        "B",
    ),
    (
        "disjunctive_syllogism",
        "Disjunctive syllogism",
        "Disjunctief syllogisme",
        True,
        ["A ∨ B", "¬B"],
        "A",
    ),
    (
        "constructive_dilemma",
        "Constructive dilemma",
        "Constructief dilemma",
        True,
        ["A ∨ B", "A -> C", "B -> D"],
        "C ∨ D",
    ),
    (
        "biconditional_mp",
        "Biconditional modus ponens",
        "Bi-conditioneel modus ponens",
        True,
        ["A <-> B", "A"],
        "B",
    ),
    (
        "affirming_consequent",
        "Affirming the consequent",
        "Bevestigen van het consequent",
        False,
        ["A -> B", "B"],
        "A",
    ),
    (
        "denying_antecedent",
        "Denying the antecedent",
        "Ontkennen van het antecedent",
        False,
        ["A -> B", "¬A"],
        "¬B",
    ),
    (
        "affirming_disjunct",
        "Affirming a disjunct",
        "Bevestigen van een disjunct",
        False,
        ["A ∨ B", "A"],
        "¬B",
    ),
    (
        "affirming_disjunct",
        "Affirming a disjunct",
        "Bevestigen van een disjunct",
        False,
        ["A ∨ B", "B"],
        "¬A",
    ),
]
FORM_DEFS = [
    {
        "id": form_id,
        "en": english,
        "nl": dutch,
        "valid": valid,
        "prem": premises,
        "concl": conclusion,
        "premAst": [parse(src) for src in premises],
        "conclAst": parse(conclusion),
    }
    for form_id, english, dutch, valid, premises, conclusion in _FORM_DEFS_RAW
]


def _match_pattern(pattern: Mapping[str, Any], formula: Mapping[str, Any], bindings: dict[str, Any]) -> bool:
    if pattern["t"] == "atom" and not pattern["args"] and pattern["name"] in _META:
        variable = pattern["name"]
        if variable in bindings:
            return show(bindings[variable]) == show(formula)
        bindings[variable] = formula
        return True
    if pattern["t"] != formula["t"]:
        return False
    kind = pattern["t"]
    if kind == "not":
        return _match_pattern(pattern["f"], formula["f"], bindings)
    if kind in ("and", "or", "imp", "iff"):
        return _match_pattern(pattern["a"], formula["a"], bindings) and _match_pattern(
            pattern["b"], formula["b"], bindings
        )
    if kind == "atom":
        return pattern["name"] == formula["name"] and len(pattern["args"]) == len(formula["args"])
    return False


def detect_form(
    premises: Sequence[Mapping[str, Any]], conclusion: Mapping[str, Any]
) -> dict[str, Any] | None:
    for definition in FORM_DEFS:
        if len(definition["premAst"]) != len(premises):
            continue
        for order in itertools.permutations(premises):
            bindings: dict[str, Any] = {}
            if all(
                _match_pattern(pattern, formula, bindings)
                for pattern, formula in zip(definition["premAst"], order)
            ) and _match_pattern(definition["conclAst"], conclusion, bindings):
                return {
                    "id": definition["id"],
                    "en": definition["en"],
                    "nl": definition["nl"],
                    "valid": definition["valid"],
                }
    return None


def _combinations_of_size(count: int, size: int) -> Iterable[tuple[int, ...]]:
    return itertools.combinations(range(count), size)


def _minimal_inconsistent_core(core: Mapping[str, Any], count: int) -> list[int] | None:
    if count <= 1 or count > 12:
        return None
    for size in range(1, count + 1):
        for combination in _combinations_of_size(count, size):
            mask = sum(1 << index for index in combination)
            if not _core_sat(core, mask):
                return list(combination)
    return None


def _prop_repairs(
    premises: Sequence[Mapping[str, Any]],
    conclusion: Mapping[str, Any],
    atoms: Sequence[str],
) -> list[dict[str, Any]]:
    literals: list[dict[str, Any]] = []
    for atom in atoms:
        atom_formula = parse(atom)
        literals.extend((atom_formula, {"t": "not", "f": parse(atom)}))
    candidates: list[dict[str, Any]] = [{"f": literal, "cost": 1} for literal in literals]
    for i, left in enumerate(literals):
        for j, right in enumerate(literals):
            if i // 2 != j // 2:
                candidates.append(
                    {"f": {"t": "imp", "a": left, "b": right}, "cost": 2}
                )
    for i, left in enumerate(literals):
        for j, right in enumerate(literals):
            if i // 2 != j // 2 and i < j:
                candidates.append({"f": {"t": "or", "a": left, "b": right}, "cost": 3})
    for index, candidate in enumerate(candidates):
        candidate["key"] = index
        candidate["neg"] = show(candidate["f"]).count("¬")
    candidates.sort(key=lambda item: (item["cost"], item["neg"], item["key"]))

    conclusion_text = show(conclusion)
    seen: set[str] = set()
    seen_signatures: set[int] = set()
    output: list[dict[str, Any]] = []
    for candidate in candidates:
        formula = candidate["f"]
        rendered = show(formula)
        if rendered in seen or rendered == conclusion_text:
            continue
        seen.add(rendered)
        core = _prop_core([*premises, formula], conclusion)
        subset = (1 << (len(premises) + 1)) - 1
        if not _core_sat(core, subset) or not _core_valid(core, subset):
            continue
        alone = _prop_core([formula], conclusion)
        if _core_valid(alone, 1):
            continue
        signature = _truth_mask(formula, {atom: i for i, atom in enumerate(core["atoms"])}, len(core["atoms"]))
        if signature in seen_signatures:
            continue
        seen_signatures.add(signature)
        output.append(
            {
                "formula": rendered,
                "cost": candidate["cost"],
                "weakness": signature.bit_count() / core["N"],
            }
        )
    output.sort(key=lambda item: (-item["weakness"], item["cost"]))
    return output[:5]


def _check_prop(
    premises: Sequence[Mapping[str, Any]],
    conclusion: Mapping[str, Any] | None,
    options: Mapping[str, Any],
) -> dict[str, Any]:
    core = _prop_core(premises, conclusion)
    atoms, rows = core["atoms"], core["N"]
    full = core["full"]
    all_premises = _subset_mask(core, full)
    conclusion_values = core["conclusion_mask"]
    counterexamples: list[dict[str, bool]] = []
    sat_mask: int | None = None
    if conclusion is not None:
        counter_mask = all_premises & (core["universe"] ^ conclusion_values)
        for mask in range(rows):
            if (all_premises >> mask) & 1:
                if sat_mask is None:
                    sat_mask = mask
                if (counter_mask >> mask) & 1 and len(counterexamples) < 5:
                    counterexamples.append(_valuation(atoms, mask))
    else:
        for mask in range(rows):
            if (all_premises >> mask) & 1:
                sat_mask = mask
                break

    valid = conclusion is not None and not bool(
        all_premises & (core["universe"] ^ conclusion_values)
    )
    premises_consistent = not premises or sat_mask is not None
    inconsistent_core = (
        _minimal_inconsistent_core(core, len(premises)) if not premises_consistent else None
    )
    idle: list[int] = []
    if valid and premises_consistent and len(premises) > 1:
        keep = full
        for index in range(len(premises)):
            without = keep & ~(1 << index)
            if _core_valid(core, without):
                keep = without
                idle.append(index)

    table = None
    if conclusion is not None and len(atoms) <= 6:
        truth_rows = []
        for mask in range(rows):
            premise_values = [
                bool((premise_mask >> mask) & 1) for premise_mask in core["premise_masks"]
            ]
            all_p = all(premise_values)
            conclusion_value = bool((conclusion_values >> mask) & 1)
            truth_rows.append(
                {
                    "mask": mask,
                    "values": [bool((mask >> i) & 1) for i in range(len(atoms))],
                    "premises": premise_values,
                    "conclusion": conclusion_value,
                    "counter": all_p and not conclusion_value,
                    "model": all_p and conclusion_value,
                }
            )
        table = {"atoms": atoms, "rows": truth_rows}

    result = {
        "ok": True,
        "logic": "prop",
        "status": "valid" if valid else "invalid" if conclusion is not None else (
            "satisfiable" if premises_consistent else "unsatisfiable"
        ),
        "valid": valid if conclusion is not None else None,
        "vacuous": bool(valid and not premises_consistent and premises),
        "atoms": atoms,
        "counterexamples": counterexamples,
        "premisesConsistent": premises_consistent,
        "satExample": _valuation(atoms, sat_mask) if sat_mask is not None else None,
        "inconsistentCore": inconsistent_core,
        "idle": idle,
        "conclusionTautology": (
            bool(conclusion_values == core["universe"]) if conclusion is not None else None
        ),
        "conclusionContradiction": bool(not conclusion_values) if conclusion is not None else None,
        "form": detect_form(premises, conclusion) if conclusion is not None else None,
        "table": table,
        "repairs": [],
    }
    if (
        conclusion is not None
        and not valid
        and options.get("repairs") is not False
        and len(atoms) <= 10
    ):
        result["repairs"] = _prop_repairs(premises, conclusion, atoms)
    return result


def _check_prop_set(premises: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    core = _prop_core(premises, None)
    sat = _core_sat(core, core["full"])
    first = None
    if sat:
        satisfying = _subset_mask(core, core["full"])
        first = next(mask for mask in range(core["N"]) if (satisfying >> mask) & 1)
    return {
        "ok": True,
        "logic": "prop",
        "status": "satisfiable" if sat else "unsatisfiable",
        "atoms": core["atoms"],
        "premisesConsistent": sat,
        "satExample": _valuation(core["atoms"], first) if first is not None else None,
        "inconsistentCore": _minimal_inconsistent_core(core, len(premises)) if not sat else None,
        "idle": [],
        "repairs": [],
        "counterexamples": [],
        "form": None,
        "table": None,
    }


_TRUE = {"op": "const", "v": True}
_FALSE = {"op": "const", "v": False}


def _mk_not(node: dict[str, Any]) -> dict[str, Any]:
    if node["op"] == "const":
        return _FALSE if node["v"] else _TRUE
    if node["op"] == "not":
        return node["a"]
    return {"op": "not", "a": node}


def _mk_and(nodes: Iterable[dict[str, Any]]) -> dict[str, Any]:
    output = []
    for node in nodes:
        if node["op"] == "const":
            if not node["v"]:
                return _FALSE
            continue
        output.extend(node["args"] if node["op"] == "and" else [node])
    if not output:
        return _TRUE
    return output[0] if len(output) == 1 else {"op": "and", "args": output}


def _mk_or(nodes: Iterable[dict[str, Any]]) -> dict[str, Any]:
    output = []
    for node in nodes:
        if node["op"] == "const":
            if node["v"]:
                return _TRUE
            continue
        output.extend(node["args"] if node["op"] == "or" else [node])
    if not output:
        return _FALSE
    return output[0] if len(output) == 1 else {"op": "or", "args": output}


def _ground(
    formula: Mapping[str, Any],
    environment: Mapping[str, int],
    state: dict[str, Any],
    budget: Mapping[str, Any],
) -> dict[str, Any]:
    budget["ground_count"][0] += 1
    if budget["ground_count"][0] > MAX_GROUND_NODES:
        raise _BudgetError()
    if time.monotonic() > budget["deadline"]:
        raise _BudgetError()

    def value(term_node: Mapping[str, Any]) -> int:
        return (
            environment[term_node["name"]]
            if term_node["k"] == "var"
            else state["consts"][term_node["name"]]
        )

    kind = formula["t"]
    if kind == "top":
        return _TRUE
    if kind == "bot":
        return _FALSE
    if kind == "atom":
        values = [value(arg) for arg in formula["args"]]
        key = (formula["name"], tuple(values))
        atom_id = state["atom_ids"].get(key)
        if atom_id is None:
            state["next_id"] += 1
            atom_id = state["next_id"]
            state["atom_ids"][key] = atom_id
            state["atom_info"][atom_id] = {"name": formula["name"], "vals": values}
        return {"op": "var", "id": atom_id}
    if kind == "eq":
        return _TRUE if value(formula["a"]) == value(formula["b"]) else _FALSE
    if kind == "not":
        return _mk_not(_ground(formula["f"], environment, state, budget))
    if kind in ("and", "or"):
        left = _ground(formula["a"], environment, state, budget)
        right = _ground(formula["b"], environment, state, budget)
        return _mk_and((left, right)) if kind == "and" else _mk_or((left, right))
    if kind == "imp":
        left = _ground(formula["a"], environment, state, budget)
        right = _ground(formula["b"], environment, state, budget)
        return _mk_or((_mk_not(left), right))
    if kind == "iff":
        left = _ground(formula["a"], environment, state, budget)
        right = _ground(formula["b"], environment, state, budget)
        return _mk_and((_mk_or((_mk_not(left), right)), _mk_or((_mk_not(right), left))))
    if kind in ("all", "ex"):
        nodes = []
        for domain_value in range(state["n"]):
            local_env = dict(environment)
            local_env[formula["v"]] = domain_value
            nodes.append(_ground(formula["f"], local_env, state, budget))
        return _mk_and(nodes) if kind == "all" else _mk_or(nodes)
    raise ValueError(f"bad node {kind}")


def _to_cnf(root: Mapping[str, Any], atom_count: int) -> tuple[list[list[int]], int]:
    clauses: list[list[int]] = []
    next_variable = atom_count

    def literal(node: Mapping[str, Any]) -> int:
        nonlocal next_variable
        kind = node["op"]
        if kind == "var":
            return node["id"]
        if kind == "not":
            return -literal(node["a"])
        if kind in ("and", "or"):
            literals = [literal(child) for child in node["args"]]
            next_variable += 1
            gate = next_variable
            if kind == "and":
                clauses.extend([[-gate, item] for item in literals])
                clauses.append([gate, *(-item for item in literals)])
            else:
                clauses.append([-gate, *literals])
                clauses.extend([[gate, -item] for item in literals])
            if len(clauses) > MAX_CNF_CLAUSES:
                raise _BudgetError()
            return gate
        raise ValueError(f"bad gate {kind}")

    top = literal(root)
    clauses.append([top])
    return clauses, next_variable


def _solve(
    variable_count: int, clauses: Sequence[Sequence[int]], budget: Mapping[str, Any]
) -> list[int] | None:
    assignment = [0] * (variable_count + 1)
    trail: list[int] = []
    steps = 0
    scans = 0

    def literal_value(literal: int) -> int:
        value = assignment[abs(literal)]
        return value if literal > 0 else -value

    def undo(mark: int) -> None:
        while len(trail) > mark:
            assignment[trail.pop()] = 0

    def propagate() -> bool:
        nonlocal scans
        changed = True
        while changed:
            changed = False
            for clause_index, clause in enumerate(clauses):
                scans += 1
                if scans > 2_000_000 or (
                    clause_index % 512 == 0 and time.monotonic() > budget["deadline"]
                ):
                    raise _BudgetError()
                unassigned = 0
                last = 0
                satisfied = False
                for literal in clause:
                    value = literal_value(literal)
                    if value == 1:
                        satisfied = True
                        break
                    if value == 0:
                        unassigned += 1
                        last = literal
                if satisfied:
                    continue
                if unassigned == 0:
                    return False
                if unassigned == 1:
                    assignment[abs(last)] = 1 if last > 0 else -1
                    trail.append(abs(last))
                    changed = True
        return True

    def dpll(depth: int = 0) -> bool:
        nonlocal steps
        steps += 1
        if (
            depth > 256
            or steps > budget["max_steps"]
            or (steps % 64 == 0 and time.monotonic() > budget["deadline"])
        ):
            raise _BudgetError()
        mark = len(trail)
        if not propagate():
            undo(mark)
            return False
        pick = 0
        for clause in clauses:
            satisfied = False
            candidate = 0
            for literal in clause:
                value = literal_value(literal)
                if value == 1:
                    satisfied = True
                    break
                if value == 0 and not candidate:
                    candidate = literal
            if not satisfied and candidate:
                pick = candidate
                break
        if not pick:
            return True
        for literal in (pick, -pick):
            branch_mark = len(trail)
            assignment[abs(literal)] = 1 if literal > 0 else -1
            trail.append(abs(literal))
            if dpll(depth + 1):
                return True
            undo(branch_mark)
        undo(mark)
        return False

    return assignment if dpll() else None


def _constant_assignments(constant_count: int, domain_size: int) -> Iterable[list[int]]:
    current: list[int] = []

    def visit(index: int, maximum: int) -> Iterable[list[int]]:
        if index == constant_count:
            yield list(current)
            return
        upper = min(maximum + 1, domain_size - 1)
        for value in range(upper + 1):
            current.append(value)
            yield from visit(index + 1, max(maximum, value))
            current.pop()

    yield from visit(0, -1)


def _build_model(
    state: Mapping[str, Any], assignment: Sequence[int] | None, constant_names: Sequence[str]
) -> dict[str, Any]:
    predicates: dict[str, list[list[int]]] = {}
    arities: dict[str, int] = {}
    for atom_id in range(1, state["next_id"] + 1):
        info = state["atom_info"][atom_id]
        name = info["name"]
        predicates.setdefault(name, [])
        arities[name] = len(info["vals"])
        if assignment is not None and assignment[atom_id] == 1:
            predicates[name].append(list(info["vals"]))
    return {
        "size": state["n"],
        "constants": dict(state["consts"]),
        "predicates": predicates,
        "arities": arities,
    }


def _find_model(
    asts: Sequence[Mapping[str, Any]],
    domain_size: int,
    constant_names: Sequence[str],
    budget: Mapping[str, Any],
) -> dict[str, Any]:
    for assignment_index, constant_values in enumerate(
        _constant_assignments(len(constant_names), domain_size)
    ):
        if assignment_index >= MAX_CONSTANT_ASSIGNMENTS or time.monotonic() > budget["deadline"]:
            return {"status": "unknown"}
        constants = dict(zip(constant_names, constant_values))
        state = {
            "n": domain_size,
            "consts": constants,
            "atom_ids": {},
            "atom_info": {},
            "next_id": 0,
        }
        local_budget = dict(budget)
        local_budget["ground_count"] = [0]
        try:
            root = _mk_and(_ground(formula, {}, state, local_budget) for formula in asts)
            if root["op"] == "const":
                if root["v"]:
                    return {
                        "status": "sat",
                        "model": _build_model(state, None, constant_names),
                    }
                continue
            clauses, variable_count = _to_cnf(root, state["next_id"])
            if len(clauses) > MAX_CNF_CLAUSES:
                return {"status": "unknown"}
            solved = _solve(variable_count, clauses, budget)
        except _BudgetError:
            return {"status": "unknown"}
        if solved is not None:
            return {
                "status": "sat",
                "model": _build_model(state, solved, constant_names),
            }
    return {"status": "unsat"}


def _make_budget(deadline: float, max_steps: int = 400_000) -> dict[str, Any]:
    return {"max_steps": max_steps, "deadline": deadline}


def _fol_repairs(
    premises: Sequence[Mapping[str, Any]],
    conclusion: Mapping[str, Any],
    scan: Mapping[str, Any],
    constants: Sequence[str],
    max_size: int,
    milliseconds: int,
) -> list[dict[str, Any]]:
    unary = [name for name, arities in scan["preds"].items() if 1 in arities]
    candidates: list[dict[str, Any]] = []
    for predicate in unary:
        candidates.append(
            {"src": f"∃x {predicate}(x)", "cost": 1, "kind": "existential_import"}
        )
        for constant in constants:
            candidates.append({"src": f"{predicate}({constant})", "cost": 1, "kind": "instance"})
    for first in unary:
        for second in unary:
            if first != second:
                candidates.extend(
                    (
                        {
                            "src": f"∀x ({first}(x) → {second}(x))",
                            "cost": 2,
                            "kind": "universal",
                        },
                        {
                            "src": f"∀x ({first}(x) → ¬{second}(x))",
                            "cost": 2,
                            "kind": "universal_neg",
                        },
                    )
                )

    output: list[dict[str, Any]] = []
    deadline = time.monotonic() + min(milliseconds, 4_000) / 1_000
    size = min(max_size, 3)
    for candidate in candidates:
        if time.monotonic() > deadline:
            break
        formula = parse(candidate["src"])
        augmented = [*premises, formula]
        candidate_constants = sorted(set(constants) | _scan([formula])["consts"])

        def budget() -> dict[str, Any]:
            return _make_budget(time.monotonic() + 0.6, 60_000)

        countermodel_exists = False
        for domain_size in range(1, size + 1):
            result = _find_model(
                [*augmented, {"t": "not", "f": conclusion}],
                domain_size,
                candidate_constants,
                budget(),
            )
            if result["status"] != "unsat":
                countermodel_exists = True
                break
        if countermodel_exists:
            continue

        consistent = False
        for domain_size in range(1, size + 1):
            if (
                _find_model(augmented, domain_size, candidate_constants, budget())["status"]
                == "sat"
            ):
                consistent = True
                break
        if not consistent:
            continue

        alone_entails = True
        for domain_size in range(1, size + 1):
            if (
                _find_model(
                    [formula, {"t": "not", "f": conclusion}],
                    domain_size,
                    candidate_constants,
                    budget(),
                )["status"]
                != "unsat"
            ):
                alone_entails = False
                break
        if alone_entails:
            continue
        output.append(
            {
                "formula": candidate["src"],
                "cost": candidate["cost"],
                "kind": candidate["kind"],
            }
        )
    output.sort(key=lambda item: item["cost"])
    return output[:5]


def _check_fol(
    premises: Sequence[Mapping[str, Any]],
    conclusion: Mapping[str, Any] | None,
    options: Mapping[str, Any],
) -> dict[str, Any]:
    requested_size = options.get("maxSize", options.get("max_size", 4))
    try:
        requested_size = int(requested_size or 4)
    except (TypeError, ValueError, OverflowError):
        requested_size = 4
    max_size = max(1, min(requested_size, 6))
    requested_ms = options.get("ms", 5_000)
    try:
        milliseconds = max(1, int(requested_ms or 5_000))
    except (TypeError, ValueError, OverflowError):
        milliseconds = 5_000
    all_formulas = [*premises, conclusion] if conclusion is not None else list(premises)
    scan = _scan(all_formulas)
    for name, arities in scan["preds"].items():
        if len(arities) > 1:
            raise LogicError(
                f"Predicate '{name}' is used with different numbers of arguments "
                f"({' and '.join(map(str, sorted(arities)))})",
                None,
                "arity",
            )
    constants = sorted(scan["consts"])
    if len(constants) > MAX_FOL_CONSTANTS:
        raise LogicError(
            f"Too many constants for finite-model search "
            f"({len(constants)} > {MAX_FOL_CONSTANTS})",
            None,
            "size",
        )

    deadline = time.monotonic() + milliseconds / 1_000
    counter_model = None
    counter_size = 0
    unknown = False
    checked_to = 0
    if conclusion is not None:
        negated = {"t": "not", "f": conclusion}
        for domain_size in range(1, max_size + 1):
            result = _find_model(
                [*premises, negated], domain_size, constants, _make_budget(deadline)
            )
            if result["status"] == "sat":
                counter_model = result["model"]
                counter_size = domain_size
                break
            if result["status"] == "unknown":
                unknown = True
                break
            checked_to = domain_size

    witness = None
    premises_known = True
    witness_size = 0
    premises_bounded_inconsistent = False
    if premises:
        all_unsatisfiable = True
        for domain_size in range(1, max_size + 1):
            result = _find_model(
                premises,
                domain_size,
                constants,
                _make_budget(max(deadline, time.monotonic() + 1.5)),
            )
            if result["status"] == "sat":
                witness = result["model"]
                witness_size = domain_size
                all_unsatisfiable = False
                break
            if result["status"] == "unknown":
                premises_known = False
                all_unsatisfiable = False
                break
        premises_bounded_inconsistent = all_unsatisfiable and witness is None

    if conclusion is None:
        status = "satisfiable" if witness else "unsat_bounded" if premises_known else "unknown"
    elif counter_model:
        status = "invalid"
    elif unknown:
        status = "unknown"
    else:
        status = "vacuous_bounded" if premises_bounded_inconsistent else "valid_bounded"
    valid: bool | None
    if status in ("valid_bounded", "vacuous_bounded"):
        valid = True
    elif status == "invalid":
        valid = False
    else:
        valid = None
    result = {
        "ok": True,
        "logic": "fol",
        "status": status,
        "valid": valid,
        "maxSize": max_size,
        "checkedTo": checked_to,
        "counterModel": counter_model,
        "counterSize": counter_size,
        "premisesConsistent": (
            (True if witness else False if premises_known else None) if premises else True
        ),
        "witnessModel": witness,
        "witnessSize": witness_size,
        "constants": constants,
        "repairs": [],
        "emptyPredicates": [],
    }
    if counter_model:
        result["emptyPredicates"] = [
            predicate
            for predicate, tuples in counter_model["predicates"].items()
            if not tuples and 1 in scan["preds"].get(predicate, set())
        ]
        if options.get("repairs") is not False:
            result["repairs"] = _fol_repairs(
                premises, conclusion, scan, constants, max_size, milliseconds
            )
    return result


def _parse_all(
    premise_sources: Sequence[str], conclusion_source: str | None
) -> tuple[list[dict[str, Any]], dict[str, Any] | None, list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    premises: list[dict[str, Any]] = []
    for index, source in enumerate(premise_sources):
        if not str(source).strip():
            continue
        try:
            premises.append(parse(str(source)))
        except LogicError as exc:
            errors.append(
                {
                    "where": "premise",
                    "index": index,
                    "message": str(exc),
                    "pos": exc.pos,
                    "code": exc.code,
                }
            )
    conclusion = None
    if conclusion_source is not None and str(conclusion_source).strip():
        try:
            conclusion = parse(str(conclusion_source))
        except LogicError as exc:
            errors.append(
                {
                    "where": "conclusion",
                    "index": 0,
                    "message": str(exc),
                    "pos": exc.pos,
                    "code": exc.code,
                }
            )
    return premises, conclusion, errors


def check_argument(
    premises: list[str], conclusion: str, options: dict | None = None
) -> dict[str, Any]:
    """Check an argument or, without a conclusion, premise satisfiability."""
    options = options or {}
    if not isinstance(premises, (list, tuple)):
        return {
            "ok": False,
            "errors": [
                {
                    "where": "input",
                    "index": 0,
                    "message": "Premises must be a list of formulas",
                    "code": "input",
                }
            ],
        }
    premise_sources = [str(source) for source in premises]
    nonempty_sources = [source for source in premise_sources if source.strip()]
    if len(nonempty_sources) > MAX_PREMISES:
        return {
            "ok": False,
            "errors": [
                {
                    "where": "input",
                    "index": 0,
                    "message": f"Too many premises (max {MAX_PREMISES})",
                    "code": "size",
                }
            ],
        }
    premises_ast, conclusion_ast, errors = _parse_all(nonempty_sources, conclusion)
    if errors:
        return {"ok": False, "errors": errors}
    all_formulas = [*premises_ast, conclusion_ast] if conclusion_ast is not None else premises_ast
    if not all_formulas:
        return {
            "ok": False,
            "errors": [
                {"where": "input", "index": 0, "message": "Nothing to check", "code": "empty"}
            ],
        }
    requested_mode = options.get("mode", "auto")
    mode = requested_mode if requested_mode in ("prop", "fol") else classify(all_formulas)
    if mode == "prop" and classify(all_formulas) == "fol":
        return {
            "ok": False,
            "errors": [
                {
                    "where": "input",
                    "index": 0,
                    "message": "Quantifiers or equality need predicate-logic mode",
                    "code": "mode",
                }
            ],
        }
    try:
        if mode == "prop":
            result = (
                _check_prop(premises_ast, conclusion_ast, options)
                if conclusion_ast is not None
                else _check_prop_set(premises_ast)
            )
        else:
            result = _check_fol(premises_ast, conclusion_ast, options)
    except LogicError as exc:
        return {
            "ok": False,
            "errors": [
                {"where": "input", "index": 0, "message": str(exc), "code": exc.code}
            ],
        }
    result["premises"] = [show(formula) for formula in premises_ast]
    result["conclusion"] = show(conclusion_ast) if conclusion_ast is not None else None
    result["mode"] = mode
    return result


def analyze_formula(src: str, options: Mapping[str, Any] | None = None) -> dict[str, Any]:
    formula = parse(src)
    if classify([formula]) == "prop":
        core = _prop_core([formula], None)
        true_rows = core["premise_masks"][0].bit_count()
        kind = (
            "tautology"
            if true_rows == core["N"]
            else "contradiction"
            if true_rows == 0
            else "contingent"
        )
        return {
            "ok": True,
            "logic": "prop",
            "kind": kind,
            "atoms": core["atoms"],
            "trueRows": true_rows,
            "rows": core["N"],
            "formula": show(formula),
        }
    first = _check_fol([], formula, {**(options or {}), "repairs": False})
    second = _check_fol([formula], None, {**(options or {}), "repairs": False})
    kind = (
        "contingent"
        if first["status"] == "invalid" and second["status"] == "satisfiable"
        else "contradiction_bounded"
        if first["status"] == "invalid"
        else "tautology_bounded"
    )
    return {
        "ok": True,
        "logic": "fol",
        "kind": kind,
        "formula": show(formula),
        "model": second["witnessModel"],
        "counterModel": first["counterModel"],
    }


def equivalent(
    first_source: str, second_source: str, options: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    first, second = parse(first_source), parse(second_source)
    both = {"t": "iff", "a": first, "b": second}
    mode = classify([first, second])
    if mode == "prop":
        analysis = analyze_formula(show(both))
        return {
            "ok": True,
            "logic": "prop",
            "equivalent": analysis["kind"] == "tautology",
        }
    result = _check_fol([], both, {**(options or {}), "repairs": False})
    return {
        "ok": True,
        "logic": "fol",
        "equivalent": (
            False
            if result["status"] == "invalid"
            else True
            if result["status"] == "valid_bounded"
            else None
        ),
        "counterModel": result["counterModel"],
    }


def describe_model(model: Mapping[str, Any]) -> list[str]:
    def element(index: int) -> str:
        return f"e{index + 1}"

    lines = ["Domain: {" + ", ".join(element(i) for i in range(model["size"])) + "}"]
    lines.extend(
        f"{constant} = {element(value)}" for constant, value in model["constants"].items()
    )
    for predicate, tuples in model["predicates"].items():
        if not tuples:
            rendered = "∅"
        else:
            rendered = "{" + ", ".join(
                element(values[0])
                if len(values) == 1
                else "(" + ", ".join(element(value) for value in values) + ")"
                if values
                else "⊤"
                for values in tuples
            ) + "}"
        lines.append(f"{predicate} = {rendered}")
    return lines


__all__ = [
    "FORM_DEFS",
    "MAX_PROP_ATOMS",
    "LogicError",
    "analyze_formula",
    "check_argument",
    "classify",
    "describe_model",
    "detect_form",
    "equivalent",
    "parse",
    "show",
]
