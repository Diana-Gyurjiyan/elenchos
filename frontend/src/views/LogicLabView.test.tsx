import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createAnalysis, normalizeAgentA } from "../capabilities/analysis/normalize";
import { LogicLabView } from "./LogicLabView";

vi.mock("../capabilities/CapabilityProvider", () => ({
  useCapability: () => ({ checkArgument: vi.fn() }),
}));

describe("Logic Lab analysis review", () => {
  it("shows the natural-language inference beside its editable formalisation", () => {
    const analysis = createAnalysis("A short argument.", "en");
    normalizeAgentA(analysis, { t: "claim", id: "c1", text: "The road is wet.", role: "premise" });
    normalizeAgentA(analysis, { t: "claim", id: "c2", text: "It has rained.", role: "conclusion" });
    normalizeAgentA(analysis, {
      t: "inference",
      id: "i1",
      from: ["c1"],
      to: "c2",
      formal: { logic: "prop", premises: ["WetStreet"], conclusion: "Rain" },
    });

    const html = renderToString(
      <LogicLabView
        analysis={analysis}
        seed={{
          premises: ["WetStreet"],
          conclusion: "Rain",
          inferenceId: "i1",
          source: "A",
          analysisId: analysis.id,
          nonce: 1,
        }}
      />,
    );

    expect(html).toContain("Herzie een stap uit je analyse");
    expect(html).toContain("The road is wet.");
    expect(html).toContain("It has rained.");
    expect(html).toContain("WetStreet");
    expect(html).toContain("Rain");
    expect(html).toContain("Uitkomst van de oorspronkelijke formalisering");
  });
});
