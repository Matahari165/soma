import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { previewDashboard } from "@/lib/local-preview";

import { ScoreLink } from "./score-link";

describe("ScoreLink", () => {
  it("shows status, target, baseline context, and freshness without relying on aria labels", () => {
    const markup = renderToStaticMarkup(<ScoreLink metric={previewDashboard.scores[0]} />);
    expect(markup).toContain("Restorative");
    expect(markup).toContain("of 8h 10m needed");
    expect(markup).toContain("84% regularity");
    expect(markup).toContain("Current · measured");
    expect(markup).toContain("100% coverage");
  });
});
