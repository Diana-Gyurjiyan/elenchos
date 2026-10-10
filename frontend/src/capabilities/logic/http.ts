import type { CheckOptions, CheckResult } from "./engine";
import type { LogicLabPort } from "../../types";

/** Sends Logic Lab argument checks to the backend logic capability. */
export const httpLogic: LogicLabPort = {
  async checkArgument(premises: string[], conclusion: string, options?: CheckOptions): Promise<CheckResult> {
    const response = await fetch("/api/logic/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        premises,
        conclusion,
        mode: options?.mode ?? "auto",
        maxSize: options?.maxSize ?? 4,
      }),
    });
    if (!response.ok) throw new Error(`Logic API request failed (HTTP ${response.status})`);
    return (await response.json()) as CheckResult;
  },
};
