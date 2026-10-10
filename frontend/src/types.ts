import type { CheckOptions, CheckResult, Equivalence, FormulaAnalysis } from "./capabilities/logic/engine";

/** Capability ports. The UI only ever talks to these shapes; adapters decide where the work happens. */

export class CapabilityError extends Error {
  /** i18n-friendly code: rate_limited, refused, auth, generic, cancelled, unavailable */
  code: string;
  /** Partial text received before the failure, if any (the original app fed it to its parser). */
  text?: string;
  constructor(code: string, text?: string) {
    super(code);
    this.code = code;
    this.text = text;
  }
}

export interface SampleOptions {
  signal?: AbortSignal;
  onText?: (update: { text: string }) => void;
}

/** What the user picked. Empty model = provider default; API keys travel only per request. */
export interface ModelChoice {
  provider: string;
  model: string;
  apiKey: string;
}
export interface ProviderInfo {
  id: string;
  label: string;
  needs_key: boolean;
  has_server_key: boolean;
  available: boolean;
  default_model: string;
  models: string[];
}
export interface ProvidersResponse {
  default: string;
  providers: ProviderInfo[];
}
export interface SampleResult {
  text: string;
  truncated: boolean;
}
export type SamplePort = (prompt: string, options?: SampleOptions) => Promise<SampleResult>;

export type Doc = Record<string, unknown>;
export interface ListOptions {
  orderBy?: string;
  desc?: boolean;
  limit?: number;
}
export interface Collection {
  list(options?: ListOptions): Promise<Doc[]>;
  get(id: string): Promise<Doc | null>;
  set(id: string, doc: Doc): Promise<void>;
  delete(id: string): Promise<void>;
}
export interface StorePort {
  collection(name: string): Collection;
}

export interface UserPort {
  id(): Promise<string>;
}

export interface DownloadsPort {
  save(file: { filename: string; data: string; mime?: string }): Promise<void>;
}

/** Propositional and first-order argument checking (see capabilities/logic/engine.d.ts for results). */
export interface LogicPort {
  checkArgument(premises: string[], conclusion: string, options?: CheckOptions): CheckResult;
  analyzeFormula(src: string, options?: CheckOptions): FormulaAnalysis;
  equivalent(a: string, b: string, options?: CheckOptions): Equivalence;
}

export interface LogicLabPort {
  checkArgument(premises: string[], conclusion: string, options?: CheckOptions): Promise<CheckResult>;
}

export interface Capabilities {
  sample: SamplePort;
  store: StorePort;
  user: UserPort;
  downloads: DownloadsPort;
  logic: LogicPort;
  logicLab: LogicLabPort;
}
export type CapabilityName = keyof Capabilities;

export interface CapabilityInfo {
  available: boolean;
  adapter: string | null;
}
