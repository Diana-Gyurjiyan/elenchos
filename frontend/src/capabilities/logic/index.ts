import type { LogicPort } from "../../types";
import { analyzeFormula, checkArgument, equivalent } from "./engine";

/** The `logic` capability, served in the browser: pure, deterministic, no round trip. */
export const localLogic: LogicPort = { checkArgument, analyzeFormula, equivalent };
