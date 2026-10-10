import { CapabilityError, type ModelChoice, type SamplePort } from "../../types";
import { ndjson } from "./ndjson";

type Ev =
  | { type: "text"; text: string }
  | { type: "done"; truncated: boolean }
  | { type: "error"; code: string };

/** The port stays `sample(prompt, options)`; the user's model choice is read at call time. */
export function createHttpSample(getChoice: () => ModelChoice): SamplePort {
  return async (prompt, options = {}) => {
    const choice = getChoice();
    let text = "";
    try {
      const res = await fetch("/api/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          provider: choice.provider,
          model: choice.model,
          api_key: choice.apiKey,
        }),
        signal: options.signal,
      });
      if (!res.ok || !res.body) {
        throw new CapabilityError(res.status === 503 ? "unavailable" : "generic");
      }
      for await (const ev of ndjson<Ev>(res.body)) {
        if (ev.type === "text") {
          text += ev.text;
          options.onText?.({ text: ev.text });
        } else if (ev.type === "error") {
          throw new CapabilityError(ev.code, text);
        } else if (ev.type === "done") {
          return { text, truncated: ev.truncated };
        }
      }
      throw new CapabilityError("generic", text); // stream ended without done
    } catch (e) {
      if (e instanceof CapabilityError) throw e;
      if ((e as Error)?.name === "AbortError") throw new CapabilityError("cancelled", text);
      throw new CapabilityError("generic", text);
    }
  };
}
