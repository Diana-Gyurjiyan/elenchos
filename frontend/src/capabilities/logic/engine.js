/* Logic engine for Elenchos
 * - Parser for propositional + first-order formulas (unicode or ASCII)
 * - Propositional: exhaustive truth tables (decisive)
 * - First-order: finite-model search via grounding + DPLL SAT (a found countermodel is decisive;
 *   "no countermodel up to size N" is evidence only, since FOL validity is undecidable)
 * No dependencies. ES module, ported from the UMD original (behaviour unchanged; typed in engine.d.ts).
 */

class LogicError extends Error {
  constructor(message, pos, code) {
    super(message);
    this.name = 'LogicError';
    this.pos = pos == null ? null : pos;
    this.code = code || 'syntax';
  }
}

/* ------------------------------------------------------------------ tokenizer */
const KEYWORDS = { and: 'and', or: 'or', not: 'not', implies: 'imp', iff: 'iff', forall: 'all', exists: 'ex', true: 'top', false: 'bot' };
const OPS = [
  ['iff', /^(<->|<=>|↔|⇔|≡)/],
  ['imp', /^(->|=>|→|⇒|⊃)/],
  ['neq', /^(≠|!=)/],
  ['and', /^(&&|&|∧|\/\\|\^)/],
  ['or', /^(\|\||\||∨|\\\/)/],
  ['not', /^(¬|!|~|-)/],
  ['eq', /^=/],
  ['all', /^∀/],
  ['ex', /^∃/],
  ['top', /^⊤/],
  ['bot', /^⊥/],
  ['lp', /^[(\[]/],
  ['rp', /^[)\]]/],
  ['comma', /^,/],
  ['dot', /^[.:]/],
];
const ID_RE = /^[A-Za-z_À-ɏͰ-Ͽ][A-Za-z0-9_'₀-₉À-ɏͰ-Ͽ]*/;

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = src.slice(i);
    let matched = false;
    for (const [type, re] of OPS) {
      const m = rest.match(re);
      if (m) { toks.push({ t: type, v: m[0], pos: i }); i += m[0].length; matched = true; break; }
    }
    if (matched) continue;
    const m = rest.match(ID_RE);
    if (m) {
      const kw = KEYWORDS[m[0]];
      toks.push({ t: kw || 'id', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    throw new LogicError(`Unexpected character '${c}'`, i, 'char');
  }
  return toks;
}

/* ------------------------------------------------------------------ parser
 * Precedence (tight to loose): ¬ / quantifier  >  ∧  >  ∨  >  →  >  ↔
 * A quantifier binds tightly (∀x P(x) → Q(x) = (∀x P(x)) → Q(x)); write "∀x. φ" or use
 * parentheses for wide scope. → is right-associative.
 */
function parse(src) {
  const toks = tokenize(String(src));
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const err = (m, t, code) => { throw new LogicError(m, t ? t.pos : String(src).length, code); };
  const expect = (type, what) => {
    const t = next();
    if (!t || t.t !== type) err(`Expected ${what || type}` + (t ? `, found '${t.v}'` : ' at end of formula'), t);
    return t;
  };
  const mkTerm = (v, bound) => (bound.has(v) ? { k: 'var', name: v } : { k: 'const', name: v });
  function term(bound) {
    const t = expect('id', 'a name');
    if (peek() && peek().t === 'lp') err('Function symbols are not supported; use a predicate (e.g. Father(x, y)) instead', peek(), 'function');
    return mkTerm(t.v, bound);
  }
  function pIff(bound) {
    let l = pImp(bound);
    while (peek() && peek().t === 'iff') { next(); l = { t: 'iff', a: l, b: pImp(bound) }; }
    return l;
  }
  function pImp(bound) {
    const l = pOr(bound);
    if (peek() && peek().t === 'imp') { next(); return { t: 'imp', a: l, b: pImp(bound) }; }
    return l;
  }
  function pOr(bound) {
    let l = pAnd(bound);
    while (peek() && peek().t === 'or') { next(); l = { t: 'or', a: l, b: pAnd(bound) }; }
    return l;
  }
  function pAnd(bound) {
    let l = pUn(bound);
    while (peek() && peek().t === 'and') { next(); l = { t: 'and', a: l, b: pUn(bound) }; }
    return l;
  }
  function pUn(bound) {
    const t = peek();
    if (!t) err('Unexpected end of formula');
    if (t.t === 'not') { next(); return { t: 'not', f: pUn(bound) }; }
    if (t.t === 'all' || t.t === 'ex') {
      next();
      const vars = [expect('id', 'a variable name').v];
      while (peek() && peek().t === 'comma') { next(); vars.push(expect('id', 'a variable name').v); }
      let wide = false;
      if (peek() && peek().t === 'dot') { next(); wide = true; }
      const nb = new Set([...bound, ...vars]);
      let body = wide ? pIff(nb) : pUn(nb);
      for (let i = vars.length - 1; i >= 0; i--) body = { t: t.t, v: vars[i], f: body };
      return body;
    }
    return pPrimary(bound);
  }
  function pPrimary(bound) {
    const t = next();
    if (t.t === 'lp') {
      const f = pIff(bound);
      expect('rp', "')'");
      return f;
    }
    if (t.t === 'top') return { t: 'top' };
    if (t.t === 'bot') return { t: 'bot' };
    if (t.t === 'id') {
      const nx = peek();
      if (nx && nx.t === 'lp') {
        next();
        const args = [];
        if (peek() && peek().t !== 'rp') {
          args.push(term(bound));
          while (peek() && peek().t === 'comma') { next(); args.push(term(bound)); }
        }
        expect('rp', "')'");
        if (peek() && (peek().t === 'eq' || peek().t === 'neq')) err('Function symbols are not supported; use a predicate (e.g. Father(x, y)) instead', peek(), 'function');
        return { t: 'atom', name: t.v, args };
      }
      if (nx && (nx.t === 'eq' || nx.t === 'neq')) {
        next();
        const e = { t: 'eq', a: mkTerm(t.v, bound), b: term(bound) };
        return nx.t === 'neq' ? { t: 'not', f: e } : e;
      }
      if (bound.has(t.v)) err(`Variable '${t.v}' cannot stand alone as a proposition`, t);
      return { t: 'atom', name: t.v, args: [] };
    }
    err(`Unexpected '${t.v}'`, t);
  }
  if (!toks.length) throw new LogicError('Empty formula', 0, 'empty');
  const f = pIff(new Set());
  if (p < toks.length) err(`Unexpected '${toks[p].v}'`, toks[p]);
  return f;
}

/* ------------------------------------------------------------------ printing */
function termStr(t) { return t.name; }
function show(f, ctx) {
  ctx = ctx || 0;
  const wrap = (prec, s) => (prec < ctx ? '(' + s + ')' : s);
  switch (f.t) {
    case 'top': return '⊤';
    case 'bot': return '⊥';
    case 'atom': return f.args.length ? f.name + '(' + f.args.map(termStr).join(', ') + ')' : f.name;
    case 'eq': return termStr(f.a) + ' = ' + termStr(f.b);
    case 'not':
      if (f.f.t === 'eq') return termStr(f.f.a) + ' ≠ ' + termStr(f.f.b);
      return '¬' + show(f.f, 5);
    case 'all': return wrap(5, '∀' + f.v + ' ' + show(f.f, 5));
    case 'ex': return wrap(5, '∃' + f.v + ' ' + show(f.f, 5));
    case 'and': return wrap(4, show(f.a, 4) + ' ∧ ' + show(f.b, 5));
    case 'or': return wrap(3, show(f.a, 3) + ' ∨ ' + show(f.b, 4));
    case 'imp': return wrap(2, show(f.a, 3) + ' → ' + show(f.b, 2));
    case 'iff': return wrap(1, show(f.a, 2) + ' ↔ ' + show(f.b, 2));
  }
  throw new Error('bad node ' + f.t);
}

/* ------------------------------------------------------------------ analysis helpers */
function scan(asts) {
  const acc = { preds: new Map(), consts: new Set(), quant: false, eq: false };
  const walk = (f) => {
    switch (f.t) {
      case 'atom':
        if (!acc.preds.has(f.name)) acc.preds.set(f.name, new Set());
        acc.preds.get(f.name).add(f.args.length);
        for (const t of f.args) if (t.k === 'const') acc.consts.add(t.name);
        break;
      case 'eq':
        acc.eq = true;
        for (const t of [f.a, f.b]) if (t.k === 'const') acc.consts.add(t.name);
        break;
      case 'not': walk(f.f); break;
      case 'all': case 'ex': acc.quant = true; walk(f.f); break;
      case 'and': case 'or': case 'imp': case 'iff': walk(f.a); walk(f.b); break;
    }
  };
  asts.forEach(walk);
  return acc;
}
function classify(asts) {
  const s = scan(asts);
  return s.quant || s.eq ? 'fol' : 'prop';
}
function atomKey(f) { return show(f); }

/* ------------------------------------------------------------------ propositional engine */
const MAX_PROP_ATOMS = 20;

function collectAtoms(f, set) {
  switch (f.t) {
    case 'atom': set.add(atomKey(f)); break;
    case 'not': collectAtoms(f.f, set); break;
    case 'and': case 'or': case 'imp': case 'iff': collectAtoms(f.a, set); collectAtoms(f.b, set); break;
  }
}
function compile(f, idx) {
  switch (f.t) {
    case 'top': return () => true;
    case 'bot': return () => false;
    case 'atom': { const i = idx.get(atomKey(f)); return (m) => ((m >> i) & 1) === 1; }
    case 'not': { const g = compile(f.f, idx); return (m) => !g(m); }
    case 'and': { const a = compile(f.a, idx), b = compile(f.b, idx); return (m) => a(m) && b(m); }
    case 'or': { const a = compile(f.a, idx), b = compile(f.b, idx); return (m) => a(m) || b(m); }
    case 'imp': { const a = compile(f.a, idx), b = compile(f.b, idx); return (m) => !a(m) || b(m); }
    case 'iff': { const a = compile(f.a, idx), b = compile(f.b, idx); return (m) => a(m) === b(m); }
  }
  throw new LogicError('Quantifiers or equality in propositional mode', null, 'mode');
}
function valuation(atoms, mask) {
  const v = {};
  atoms.forEach((a, i) => { v[a] = ((mask >> i) & 1) === 1; });
  return v;
}

/* Core: evaluates premises + conclusion over every row. */
function propCore(prems, concl) {
  const set = new Set();
  prems.forEach((f) => collectAtoms(f, set));
  if (concl) collectAtoms(concl, set);
  const atoms = [...set].sort();
  if (atoms.length > MAX_PROP_ATOMS) throw new LogicError(`Too many propositional atoms (${atoms.length} > ${MAX_PROP_ATOMS})`, null, 'size');
  if (prems.length > 30) throw new LogicError('Too many premises (max 30)', null, 'size');
  const idx = new Map(atoms.map((a, i) => [a, i]));
  const pf = prems.map((f) => compile(f, idx));
  const cf = concl ? compile(concl, idx) : null;
  const N = 1 << atoms.length;
  const rowBits = new Int32Array(N);
  const cv = new Uint8Array(N);
  for (let m = 0; m < N; m++) {
    let b = 0;
    for (let j = 0; j < pf.length; j++) if (pf[j](m)) b |= 1 << j;
    rowBits[m] = b;
    cv[m] = cf ? (cf(m) ? 1 : 0) : 0;
  }
  return { atoms, N, rowBits, cv, full: prems.length === 31 ? -1 : (1 << prems.length) - 1, pf, cf };
}
function coreValid(core, subsetMask) {
  for (let m = 0; m < core.N; m++) if ((core.rowBits[m] & subsetMask) === subsetMask && !core.cv[m]) return false;
  return true;
}
function coreSat(core, subsetMask) {
  for (let m = 0; m < core.N; m++) if ((core.rowBits[m] & subsetMask) === subsetMask) return true;
  return false;
}

/* Known argument forms (propositional). Metavariables: A B C D. */
const META = new Set(['A', 'B', 'C', 'D']);
const FORM_DEFS = [
  { id: 'modus_ponens', en: 'Modus ponens', nl: 'Modus ponens', valid: true, prem: ['A -> B', 'A'], concl: 'B' },
  { id: 'modus_tollens', en: 'Modus tollens', nl: 'Modus tollens', valid: true, prem: ['A -> B', '¬B'], concl: '¬A' },
  { id: 'hypothetical_syllogism', en: 'Hypothetical syllogism', nl: 'Hypothetisch syllogisme', valid: true, prem: ['A -> B', 'B -> C'], concl: 'A -> C' },
  { id: 'disjunctive_syllogism', en: 'Disjunctive syllogism', nl: 'Disjunctief syllogisme', valid: true, prem: ['A ∨ B', '¬A'], concl: 'B' },
  { id: 'disjunctive_syllogism', en: 'Disjunctive syllogism', nl: 'Disjunctief syllogisme', valid: true, prem: ['A ∨ B', '¬B'], concl: 'A' },
  { id: 'constructive_dilemma', en: 'Constructive dilemma', nl: 'Constructief dilemma', valid: true, prem: ['A ∨ B', 'A -> C', 'B -> D'], concl: 'C ∨ D' },
  { id: 'biconditional_mp', en: 'Biconditional modus ponens', nl: 'Bi-conditioneel modus ponens', valid: true, prem: ['A <-> B', 'A'], concl: 'B' },
  { id: 'affirming_consequent', en: 'Affirming the consequent', nl: 'Bevestigen van het consequent', valid: false, prem: ['A -> B', 'B'], concl: 'A' },
  { id: 'denying_antecedent', en: 'Denying the antecedent', nl: 'Ontkennen van het antecedent', valid: false, prem: ['A -> B', '¬A'], concl: '¬B' },
  { id: 'affirming_disjunct', en: 'Affirming a disjunct', nl: 'Bevestigen van een disjunct', valid: false, prem: ['A ∨ B', 'A'], concl: '¬B' },
  { id: 'affirming_disjunct', en: 'Affirming a disjunct', nl: 'Bevestigen van een disjunct', valid: false, prem: ['A ∨ B', 'B'], concl: '¬A' },
].map((d) => ({ ...d, premAst: d.prem.map(parse), conclAst: parse(d.concl) }));

function matchPat(pat, f, b) {
  if (pat.t === 'atom' && pat.args.length === 0 && META.has(pat.name)) {
    if (b[pat.name]) return show(b[pat.name]) === show(f);
    b[pat.name] = f;
    return true;
  }
  if (pat.t !== f.t) return false;
  switch (pat.t) {
    case 'not': return matchPat(pat.f, f.f, b);
    case 'and': case 'or': case 'imp': case 'iff': return matchPat(pat.a, f.a, b) && matchPat(pat.b, f.b, b);
    case 'atom': return pat.name === f.name && pat.args.length === f.args.length;
    default: return false;
  }
}
function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((x, i) => permutations(arr.filter((_, j) => j !== i)).forEach((rest) => out.push([x, ...rest])));
  return out;
}
function detectForm(prems, concl) {
  for (const def of FORM_DEFS) {
    if (def.premAst.length !== prems.length) continue;
    for (const perm of permutations(prems)) {
      const b = {};
      if (def.premAst.every((pp, i) => matchPat(pp, perm[i], b)) && matchPat(def.conclAst, concl, b)) {
        return { id: def.id, en: def.en, nl: def.nl, valid: def.valid };
      }
    }
  }
  return null;
}

function checkProp(prems, concl, opts) {
  opts = opts || {};
  const core = propCore(prems, concl);
  const { atoms, N, rowBits, cv, full } = core;
  const counterexamples = [];
  let satExample = null;
  let concTrue = 0;
  for (let m = 0; m < N; m++) {
    const allP = (rowBits[m] & full) === full;
    if (cv[m]) concTrue++;
    if (allP) {
      if (satExample === null) satExample = m;
      if (!cv[m] && counterexamples.length < 5) counterexamples.push(m);
    }
  }
  const valid = coreValid(core, full);
  const premisesConsistent = prems.length === 0 ? true : satExample !== null;
  // minimal inconsistent subset
  let inconsistentCore = null;
  if (!premisesConsistent && prems.length > 1 && prems.length <= 12) {
    outer: for (let k = 1; k <= prems.length; k++) {
      const combo = [];
      const rec = (start) => {
        if (combo.length === k) {
          const mask = combo.reduce((a, i) => a | (1 << i), 0);
          return !coreSat(core, mask);
        }
        for (let i = start; i < prems.length; i++) {
          combo.push(i);
          if (rec(i + 1)) return true;
          combo.pop();
        }
        return false;
      };
      if (rec(0)) { inconsistentCore = combo.slice(); break outer; }
    }
  }
  // idle premises: greedily drop premises not needed for validity
  let idle = [];
  if (valid && premisesConsistent && prems.length > 1) {
    let keep = full;
    for (let j = 0; j < prems.length; j++) {
      const without = keep & ~(1 << j);
      if (coreValid(core, without)) { keep = without; idle.push(j); }
    }
  }
  const rows = atoms.length <= 6
    ? Array.from({ length: N }, (_, m) => {
        const pv = prems.map((_, j) => ((rowBits[m] >> j) & 1) === 1);
        const allP = pv.every(Boolean);
        return { mask: m, values: atoms.map((_, i) => ((m >> i) & 1) === 1), premises: pv, conclusion: !!cv[m], counter: allP && !cv[m], model: allP && !!cv[m] };
      })
    : null;
  const res = {
    ok: true,
    logic: 'prop',
    status: valid ? 'valid' : 'invalid',
    valid,
    vacuous: valid && !premisesConsistent && prems.length > 0,
    atoms,
    counterexamples: counterexamples.map((m) => valuation(atoms, m)),
    premisesConsistent,
    satExample: satExample === null ? null : valuation(atoms, satExample),
    inconsistentCore,
    idle,
    conclusionTautology: concTrue === N,
    conclusionContradiction: concTrue === 0,
    form: detectForm(prems, concl),
    table: rows ? { atoms, rows } : null,
    repairs: [],
  };
  if (!valid && opts.repairs !== false && atoms.length <= 10) res.repairs = propRepairs(prems, concl, core, atoms);
  return res;
}

/* Hidden-assumption finder: simplest extra premises that make an invalid propositional argument valid. */
function propRepairs(prems, concl, baseCore, atoms) {
  const lits = [];
  atoms.forEach((a) => { const f = { t: 'atom', name: a, args: [] }; lits.push(f, { t: 'not', f }); });
  // atoms with parentheses (ground atoms like P(a)) are re-parsed from their key
  const litAsts = lits.map((l) => (l.t === 'atom' ? parse(l.name) : { t: 'not', f: parse(l.f.name) }));
  const cands = [];
  litAsts.forEach((l) => cands.push({ f: l, cost: 1 }));
  // implications first so that, among logically equivalent candidates, the readable "if … then" form wins
  litAsts.forEach((x, i) => litAsts.forEach((y, j) => {
    if (Math.floor(i / 2) === Math.floor(j / 2)) return;
    cands.push({ f: { t: 'imp', a: x, b: y }, cost: 2 });
  }));
  litAsts.forEach((x, i) => litAsts.forEach((y, j) => {
    if (Math.floor(i / 2) === Math.floor(j / 2) || i >= j) return;
    cands.push({ f: { t: 'or', a: x, b: y }, cost: 3 });
  }));
  // among equivalent candidates keep the simplest wording: lower cost first, then fewer negations
  const negs = (f) => (show(f).match(/¬/g) || []).length;
  cands.forEach((c, i) => { c.k = i; c.neg = negs(c.f); });
  cands.sort((a, b) => a.cost - b.cost || a.neg - b.neg || a.k - b.k);
  const concStr = show(concl);
  const out = [];
  const seen = new Set();
  const seenSig = new Set();
  for (const c of cands) {
    const s = show(c.f);
    if (seen.has(s) || s === concStr) continue;
    seen.add(s);
    const core = propCore([...prems, c.f], concl);
    const mask = (1 << (prems.length + 1)) - 1;
    if (!coreSat(core, mask) || !coreValid(core, mask)) continue;
    // candidate alone must not already entail the conclusion (that would just assume it)
    const alone = propCore([c.f], concl);
    if (coreValid(alone, 1)) continue;
    let weak = 0, sig = '';
    for (let m = 0; m < core.N; m++) { const v = core.pf[prems.length](m); if (v) weak++; sig += v ? '1' : '0'; }
    if (seenSig.has(sig)) continue; // logically equivalent to a candidate already listed
    seenSig.add(sig);
    out.push({ formula: s, cost: c.cost, weakness: weak / core.N });
  }
  out.sort((a, b) => b.weakness - a.weakness || a.cost - b.cost);
  return out.slice(0, 5);
}

/* ------------------------------------------------------------------ first-order: finite model search */
const TRUE = { op: 'const', v: true };
const FALSE = { op: 'const', v: false };
const mkNot = (a) => (a.op === 'const' ? (a.v ? FALSE : TRUE) : a.op === 'not' ? a.a : { op: 'not', a });
function mkAnd(args) {
  const out = [];
  for (const a of args) {
    if (a.op === 'const') { if (!a.v) return FALSE; continue; }
    if (a.op === 'and') out.push(...a.args); else out.push(a);
  }
  if (!out.length) return TRUE;
  return out.length === 1 ? out[0] : { op: 'and', args: out };
}
function mkOr(args) {
  const out = [];
  for (const a of args) {
    if (a.op === 'const') { if (a.v) return TRUE; continue; }
    if (a.op === 'or') out.push(...a.args); else out.push(a);
  }
  if (!out.length) return FALSE;
  return out.length === 1 ? out[0] : { op: 'or', args: out };
}

function ground(f, env, S) {
  const val = (t) => (t.k === 'var' ? env[t.name] : S.consts[t.name]);
  switch (f.t) {
    case 'top': return TRUE;
    case 'bot': return FALSE;
    case 'atom': {
      const vals = f.args.map(val);
      const key = f.name + '|' + vals.join(',');
      let id = S.atomIds.get(key);
      if (!id) { id = ++S.nextId; S.atomIds.set(key, id); S.atomInfo[id] = { name: f.name, vals }; }
      return { op: 'var', id };
    }
    case 'eq': return val(f.a) === val(f.b) ? TRUE : FALSE;
    case 'not': return mkNot(ground(f.f, env, S));
    case 'and': return mkAnd([ground(f.a, env, S), ground(f.b, env, S)]);
    case 'or': return mkOr([ground(f.a, env, S), ground(f.b, env, S)]);
    case 'imp': return mkOr([mkNot(ground(f.a, env, S)), ground(f.b, env, S)]);
    case 'iff': {
      const A = ground(f.a, env, S), B = ground(f.b, env, S);
      return mkAnd([mkOr([mkNot(A), B]), mkOr([mkNot(B), A])]);
    }
    case 'all': { const parts = []; for (let d = 0; d < S.n; d++) parts.push(ground(f.f, { ...env, [f.v]: d }, S)); return mkAnd(parts); }
    case 'ex': { const parts = []; for (let d = 0; d < S.n; d++) parts.push(ground(f.f, { ...env, [f.v]: d }, S)); return mkOr(parts); }
  }
  throw new Error('bad node');
}

function toCNF(root, nAtoms) {
  const clauses = [];
  let nv = nAtoms;
  function lit(n) {
    switch (n.op) {
      case 'var': return n.id;
      case 'not': return -lit(n.a);
      case 'and': {
        const ls = n.args.map(lit);
        const g = ++nv;
        for (const l of ls) clauses.push([-g, l]);
        clauses.push([g, ...ls.map((l) => -l)]);
        return g;
      }
      case 'or': {
        const ls = n.args.map(lit);
        const g = ++nv;
        clauses.push([-g, ...ls]);
        for (const l of ls) clauses.push([g, -l]);
        return g;
      }
    }
    throw new Error('bad gate');
  }
  const top = lit(root);
  clauses.push([top]);
  return { clauses, nvars: nv };
}

class BudgetError extends Error {}
function solve(nvars, clauses, budget) {
  const assign = new Int8Array(nvars + 1);
  const trail = [];
  let steps = 0;
  const value = (l) => { const a = assign[Math.abs(l)]; return l > 0 ? a : -a; };
  const undo = (m) => { while (trail.length > m) assign[trail.pop()] = 0; };
  function propagate() {
    let changed = true;
    while (changed) {
      changed = false;
      for (let ci = 0; ci < clauses.length; ci++) {
        const c = clauses[ci];
        let un = 0, last = 0, sat = false;
        for (let k = 0; k < c.length; k++) {
          const v = value(c[k]);
          if (v === 1) { sat = true; break; }
          if (v === 0) { un++; last = c[k]; }
        }
        if (sat) continue;
        if (un === 0) return false;
        if (un === 1) { assign[Math.abs(last)] = last > 0 ? 1 : -1; trail.push(Math.abs(last)); changed = true; }
      }
    }
    return true;
  }
  function dpll() {
    if (++steps > budget.maxSteps || (steps % 64 === 0 && Date.now() > budget.deadline)) throw new BudgetError();
    const m0 = trail.length;
    if (!propagate()) { undo(m0); return false; }
    let pick = 0;
    for (const c of clauses) {
      let sat = false, cand = 0;
      for (const l of c) { const v = value(l); if (v === 1) { sat = true; break; } if (v === 0 && !cand) cand = l; }
      if (!sat && cand) { pick = cand; break; }
    }
    if (!pick) return true;
    for (const l of [pick, -pick]) {
      const m1 = trail.length;
      assign[Math.abs(l)] = l > 0 ? 1 : -1;
      trail.push(Math.abs(l));
      if (dpll()) return true;
      undo(m1);
    }
    undo(m0);
    return false;
  }
  const sat = dpll();
  return sat ? assign : null;
}

/* Look for a model of all `asts` with domain size n. Returns {status:'sat',model} | {status:'unsat'} | {status:'unknown'} */
function findModel(asts, n, constNames, budget) {
  const assigns = [];
  (function rec(i, mx, cur) {
    if (i === constNames.length) { assigns.push(cur.slice()); return; }
    for (let v = 0; v <= Math.min(mx + 1, n - 1); v++) { cur.push(v); rec(i + 1, Math.max(mx, v), cur); cur.pop(); }
  })(0, -1, []);
  for (const asg of assigns) {
    const consts = {};
    constNames.forEach((c, i) => { consts[c] = asg[i]; });
    const S = { n, consts, atomIds: new Map(), atomInfo: [], nextId: 0 };
    let rootNode;
    try {
      rootNode = mkAnd(asts.map((a) => ground(a, {}, S)));
    } catch (e) { throw e; }
    if (rootNode.op === 'const') {
      if (rootNode.v) return { status: 'sat', model: buildModel(S, null, constNames) };
      continue;
    }
    const { clauses, nvars } = toCNF(rootNode, S.nextId);
    let assign;
    try { assign = solve(nvars, clauses, budget); } catch (e) { if (e instanceof BudgetError) return { status: 'unknown' }; throw e; }
    if (assign) return { status: 'sat', model: buildModel(S, assign, constNames) };
  }
  return { status: 'unsat' };
}
function buildModel(S, assign, constNames) {
  const preds = {}, arities = {};
  for (let id = 1; id <= S.nextId; id++) {
    const info = S.atomInfo[id];
    if (!preds[info.name]) preds[info.name] = [];
    arities[info.name] = info.vals.length;
    if (assign && assign[id] === 1) preds[info.name].push(info.vals.slice());
  }
  return { size: S.n, constants: { ...S.consts }, predicates: preds, arities };
}

function checkFol(prems, concl, opts) {
  opts = opts || {};
  const maxSize = Math.max(1, Math.min(opts.maxSize || 4, 6));
  const ms = opts.ms || 5000;
  const all = concl ? [...prems, concl] : prems;
  const sc = scan(all);
  for (const [name, ar] of sc.preds) {
    if (ar.size > 1) throw new LogicError(`Predicate '${name}' is used with different numbers of arguments (${[...ar].join(' and ')})`, null, 'arity');
  }
  const constNames = [...sc.consts].sort();
  const deadline = Date.now() + ms;
  const mkBudget = () => ({ maxSteps: 400000, deadline });
  const negC = concl ? { t: 'not', f: concl } : null;
  let counter = null, counterSize = 0, unknown = false, checkedTo = 0;
  if (concl) {
    for (let n = 1; n <= maxSize; n++) {
      const r = findModel([...prems, negC], n, constNames, mkBudget());
      if (r.status === 'sat') { counter = r.model; counterSize = n; break; }
      if (r.status === 'unknown') { unknown = true; break; }
      checkedTo = n;
    }
  }
  let witness = null, premisesKnown = true, witnessSize = 0, premisesBoundedInconsistent = false;
  if (prems.length) {
    let allUnsat = true;
    for (let n = 1; n <= maxSize; n++) {
      const r = findModel(prems, n, constNames, { maxSteps: 400000, deadline: Math.max(deadline, Date.now() + 1500) });
      if (r.status === 'sat') { witness = r.model; witnessSize = n; allUnsat = false; break; }
      if (r.status === 'unknown') { premisesKnown = false; allUnsat = false; break; }
    }
    premisesBoundedInconsistent = allUnsat && !witness;
  }
  let status;
  if (!concl) status = witness ? 'satisfiable' : premisesKnown ? 'unsat_bounded' : 'unknown';
  else if (counter) status = 'invalid';
  else if (unknown) status = 'unknown';
  else status = premisesBoundedInconsistent ? 'vacuous_bounded' : 'valid_bounded';
  const res = {
    ok: true,
    logic: 'fol',
    status,
    valid: status === 'valid_bounded' || status === 'vacuous_bounded' ? true : status === 'invalid' ? false : null,
    maxSize,
    checkedTo,
    counterModel: counter,
    counterSize,
    premisesConsistent: prems.length ? (witness ? true : premisesKnown ? false : null) : true,
    witnessModel: witness,
    witnessSize,
    constants: constNames,
    repairs: [],
    emptyPredicates: [],
  };
  if (counter) {
    res.emptyPredicates = Object.keys(counter.predicates).filter((p) => counter.predicates[p].length === 0 && sc.preds.get(p) && sc.preds.get(p).has(1));
    if (opts.repairs !== false) res.repairs = folRepairs(prems, concl, sc, constNames, maxSize, ms);
  }
  return res;
}

/* Candidate hidden assumptions for FOL: existential import, universal links between unary predicates, instances. */
function folRepairs(prems, concl, sc, constNames, maxSize, ms) {
  const unary = [...sc.preds].filter(([, ar]) => ar.has(1)).map(([n]) => n);
  const cands = [];
  for (const p of unary) {
    cands.push({ src: `∃x ${p}(x)`, cost: 1, kind: 'existential_import' });
    for (const c of constNames) cands.push({ src: `${p}(${c})`, cost: 1, kind: 'instance' });
  }
  for (const p of unary) for (const q of unary) {
    if (p === q) continue;
    cands.push({ src: `∀x (${p}(x) → ${q}(x))`, cost: 2, kind: 'universal' });
    cands.push({ src: `∀x (${p}(x) → ¬${q}(x))`, cost: 2, kind: 'universal_neg' });
  }
  const out = [];
  const deadline = Date.now() + Math.min(ms, 4000);
  const size = Math.min(maxSize, 3);
  for (const c of cands) {
    if (Date.now() > deadline) break;
    const ast = parse(c.src);
    const set = [...prems, ast];
    const cn = [...new Set([...constNames, ...scan([ast]).consts])].sort();
    const bud = () => ({ maxSteps: 60000, deadline: Date.now() + 600 });
    let bad = false, consistent = false;
    for (let n = 1; n <= size && !bad; n++) {
      const r = findModel([...set, { t: 'not', f: concl }], n, cn, bud());
      if (r.status !== 'unsat') bad = true;
    }
    if (bad) continue;
    for (let n = 1; n <= size && !consistent; n++) {
      const r = findModel(set, n, cn, bud());
      if (r.status === 'sat') consistent = true;
    }
    if (!consistent) continue;
    // reject candidates that alone entail the conclusion (they simply assume it)
    let aloneBad = false;
    for (let n = 1; n <= size && !aloneBad; n++) {
      const r = findModel([ast, { t: 'not', f: concl }], n, cn, bud());
      if (r.status !== 'unsat') aloneBad = true;
    }
    if (!aloneBad) continue;
    out.push({ formula: c.src, cost: c.cost, kind: c.kind });
  }
  out.sort((a, b) => a.cost - b.cost);
  return out.slice(0, 5);
}

/* ------------------------------------------------------------------ public API */
function parseAll(premSrc, conclSrc) {
  const errors = [];
  const prems = [];
  premSrc.forEach((s, i) => {
    try { prems.push(parse(s)); } catch (e) {
      if (e instanceof LogicError) errors.push({ where: 'premise', index: i, message: e.message, pos: e.pos, code: e.code }); else throw e;
    }
  });
  let concl = null;
  if (conclSrc != null && String(conclSrc).trim() !== '') {
    try { concl = parse(conclSrc); } catch (e) {
      if (e instanceof LogicError) errors.push({ where: 'conclusion', index: 0, message: e.message, pos: e.pos, code: e.code }); else throw e;
    }
  }
  return { prems, concl, errors };
}

/* Check an argument (premises ⊢ conclusion) or, without conclusion, the consistency of the premises. */
function checkArgument(premSrc, conclSrc, opts) {
  opts = opts || {};
  const { prems, concl, errors } = parseAll(premSrc.filter((s) => String(s).trim() !== ''), conclSrc);
  if (errors.length) return { ok: false, errors };
  const hasConcl = !!concl;
  const all = hasConcl ? [...prems, concl] : prems;
  if (!all.length) return { ok: false, errors: [{ where: 'input', index: 0, message: 'Nothing to check', code: 'empty' }] };
  const mode = opts.mode && opts.mode !== 'auto' ? opts.mode : classify(all);
  try {
    let res;
    if (mode === 'prop') {
      if (classify(all) === 'fol') return { ok: false, errors: [{ where: 'input', index: 0, message: 'Quantifiers or equality need predicate-logic mode', code: 'mode' }] };
      res = hasConcl ? checkProp(prems, concl, opts) : checkPropSet(prems);
    } else {
      res = checkFol(prems, hasConcl ? concl : null, opts);
    }
    res.premises = prems.map((f) => show(f));
    res.conclusion = hasConcl ? show(concl) : null;
    res.mode = mode;
    return res;
  } catch (e) {
    if (e instanceof LogicError) return { ok: false, errors: [{ where: 'input', index: 0, message: e.message, code: e.code }] };
    throw e;
  }
}

function checkPropSet(prems) {
  const core = propCore(prems, null);
  const full = core.full;
  const sat = coreSat(core, full);
  let first = null;
  if (sat) for (let m = 0; m < core.N; m++) if ((core.rowBits[m] & full) === full) { first = m; break; }
  let inconsistentCore = null;
  if (!sat && prems.length > 1 && prems.length <= 12) {
    outer: for (let k = 1; k <= prems.length; k++) {
      const combo = [];
      const rec = (start) => {
        if (combo.length === k) return !coreSat(core, combo.reduce((a, i) => a | (1 << i), 0));
        for (let i = start; i < prems.length; i++) { combo.push(i); if (rec(i + 1)) return true; combo.pop(); }
        return false;
      };
      if (rec(0)) { inconsistentCore = combo.slice(); break outer; }
    }
  }
  return {
    ok: true, logic: 'prop', status: sat ? 'satisfiable' : 'unsatisfiable', atoms: core.atoms,
    premisesConsistent: sat, satExample: first === null ? null : valuation(core.atoms, first), inconsistentCore, idle: [], repairs: [], counterexamples: [], form: null, table: null,
  };
}

/* Classify a single formula: tautology / contradiction / contingent (propositional exact, FOL bounded). */
function analyzeFormula(src, opts) {
  const f = parse(src);
  const mode = classify([f]);
  if (mode === 'prop') {
    const core = propCore([f], null);
    let t = 0;
    for (let m = 0; m < core.N; m++) if (core.rowBits[m] & 1) t++;
    const kind = t === core.N ? 'tautology' : t === 0 ? 'contradiction' : 'contingent';
    return { ok: true, logic: 'prop', kind, atoms: core.atoms, trueRows: t, rows: core.N, formula: show(f) };
  }
  const r1 = checkFol([], f, { ...opts, repairs: false }); // is ¬f satisfiable?
  const r2 = checkFol([f], null, { ...opts, repairs: false });
  const kind = r1.status === 'invalid' ? (r2.status === 'satisfiable' ? 'contingent' : 'contradiction_bounded') : 'tautology_bounded';
  return { ok: true, logic: 'fol', kind, formula: show(f), model: r2.witnessModel, counterModel: r1.counterModel };
}

function equivalent(aSrc, bSrc, opts) {
  const a = parse(aSrc), b = parse(bSrc);
  const both = { t: 'iff', a, b };
  const mode = classify([a, b]);
  if (mode === 'prop') {
    const r = analyzeFormula(show(both));
    return { ok: true, logic: 'prop', equivalent: r.kind === 'tautology' };
  }
  const r = checkFol([], both, { ...opts, repairs: false });
  return { ok: true, logic: 'fol', equivalent: r.status === 'invalid' ? false : r.status === 'valid_bounded' ? true : null, counterModel: r.counterModel };
}

/* Render a finite model as plain lines (used by UI and tests). */
function describeModel(m) {
  const el = (i) => 'e' + (i + 1);
  const lines = [];
  lines.push('Domain: {' + Array.from({ length: m.size }, (_, i) => el(i)).join(', ') + '}');
  for (const [c, v] of Object.entries(m.constants)) lines.push(`${c} = ${el(v)}`);
  for (const [p, tuples] of Object.entries(m.predicates)) {
    lines.push(p + ' = ' + (tuples.length ? '{' + tuples.map((t) => (t.length === 1 ? el(t[0]) : t.length ? '(' + t.map(el).join(', ') + ')' : '⊤')).join(', ') + '}' : '∅'));
  }
  return lines;
}

export { LogicError, parse, show, classify, checkArgument, analyzeFormula, equivalent, describeModel, detectForm, FORM_DEFS, MAX_PROP_ATOMS };
