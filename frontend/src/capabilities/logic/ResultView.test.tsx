import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkArgument } from "./engine";
import { LAB_EXAMPLES } from "../../i18n/examples";
import { translate } from "../../i18n/translate";
import { ErrorsBox, ResultBody } from "./ResultView";
import { verdictParts } from "./verdict";

describe("lab results render", () => {
  it.each(LAB_EXAMPLES.map((e) => [e.id, e] as const))("example %s renders in the verdict language", (_id, ex) => {
    const r = checkArgument(ex.prem, ex.concl, { mode: "auto", maxSize: 4 });
    if (!r.ok) throw new Error("example should parse");
    const html = renderToString(<ResultBody r={r} hasConcl onAddPremise={() => {}} />);
    // I18nProvider is absent in this test, so the hook must be given by the test setup below.
    expect(html).toContain(verdictParts(r, (k, v) => translate("nl", k, v)).big);
  });

  it("shows syntax errors with a position", () => {
    const r = checkArgument(["P ∧"], "Q");
    if (r.ok) throw new Error("should fail");
    expect(renderToString(<ErrorsBox errors={r.errors} />)).toContain("errbox");
  });
});
