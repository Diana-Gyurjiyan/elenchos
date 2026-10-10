/** Types for the logic engine (engine.js). The engine is pure and dependency free. */

export type Valuation = Record<string, boolean>;

export interface FolModel {
  size: number;
  constants: Record<string, number>;
  predicates: Record<string, number[][]>;
  arities?: Record<string, number>;
}

export interface EngineError {
  where: "premise" | "conclusion" | "input";
  index: number;
  message: string;
  pos?: number | null;
  code?: string;
}

export interface Repair {
  formula: string;
  cost?: number;
  weakness?: number;
  kind?: string;
}

export interface FormInfo {
  id: string;
  en: string;
  nl: string;
  valid: boolean;
}

export interface TruthRow {
  mask: number;
  values: boolean[];
  premises: boolean[];
  conclusion: boolean;
  counter: boolean;
  model: boolean;
}
export interface TruthTable {
  atoms: string[];
  rows: TruthRow[];
}

export type CheckStatus =
  | "valid"
  | "invalid"
  | "valid_bounded"
  | "vacuous_bounded"
  | "satisfiable"
  | "unsatisfiable"
  | "unsat_bounded"
  | "unknown";

export interface CheckOptions {
  mode?: "auto" | "prop" | "fol";
  /** Largest finite domain tried in first-order mode. */
  maxSize?: number;
  /** Set false to skip the hidden-assumption (repair) search. */
  repairs?: boolean;
}

export interface CheckFailure {
  ok: false;
  errors: EngineError[];
}

interface CheckCommon {
  ok: true;
  status: CheckStatus;
  valid?: boolean | null;
  premises: string[];
  conclusion: string | null;
  mode: "prop" | "fol";
  premisesConsistent: boolean | null;
  repairs: Repair[];
  form?: FormInfo | null;
  inconsistentCore?: number[] | null;
  idle?: number[];
  maxSize?: number;
}
export interface PropCheck extends CheckCommon {
  logic: "prop";
  vacuous?: boolean;
  atoms: string[];
  counterexamples: Valuation[];
  satExample: Valuation | null;
  conclusionTautology?: boolean;
  conclusionContradiction?: boolean;
  table: TruthTable | null;
}
export interface FolCheck extends CheckCommon {
  logic: "fol";
  checkedTo: number;
  counterModel: FolModel | null;
  counterSize: number | null;
  witnessModel: FolModel | null;
  witnessSize: number | null;
  constants: string[];
  emptyPredicates: string[];
}
export type CheckSuccess = PropCheck | FolCheck;
export type CheckResult = CheckSuccess | CheckFailure;

export type FormulaKind =
  | "tautology"
  | "contradiction"
  | "contingent"
  | "tautology_bounded"
  | "contradiction_bounded";
export interface FormulaAnalysis {
  ok: true;
  logic: "prop" | "fol";
  kind: FormulaKind;
  formula: string;
  atoms?: string[];
  trueRows?: number;
  rows?: number;
  model?: FolModel | null;
  counterModel?: FolModel | null;
}
export interface Equivalence {
  ok: true;
  logic: "prop" | "fol";
  equivalent: boolean | null;
  counterModel?: FolModel | null;
}

export class LogicError extends Error {
  pos: number | null;
  code: string;
}
export function parse(src: string): unknown;
export function show(ast: unknown): string;
export function classify(asts: unknown[]): "prop" | "fol";
export function checkArgument(premises: string[], conclusion: string, options?: CheckOptions): CheckResult;
export function analyzeFormula(src: string, options?: CheckOptions): FormulaAnalysis;
export function equivalent(a: string, b: string, options?: CheckOptions): Equivalence;
export function describeModel(model: FolModel): string[];
export function detectForm(premises: unknown[], conclusion: unknown): FormInfo | null;
export const FORM_DEFS: unknown[];
export const MAX_PROP_ATOMS: number;
