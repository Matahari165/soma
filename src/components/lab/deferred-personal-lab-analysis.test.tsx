import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DeferredPersonalLabAnalysis } from "./deferred-personal-lab-analysis";

describe("DeferredPersonalLabAnalysis", () => {
  it("keeps the analysis and matrix out of the initial page until requested", () => {
    const html = renderToStaticMarkup(<DeferredPersonalLabAnalysis />);

    expect(html).toContain("Afficher les analyses");
    expect(html).toContain("se chargent uniquement à la demande");
    expect(html).not.toContain("Relationship matrix");
  });
});
