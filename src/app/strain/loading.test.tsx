import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("activity loading state", () => {
  it("uses the shared secondary-page loading shell", () => {
    const html = renderToStaticMarkup(createElement(Loading));

    expect(html).toContain('data-health-kind="activity"');
    expect(html).toContain("Strain");
    expect(html).not.toContain("Strain score");
    expect(html).not.toContain("health-hero-metrics");
  });
});
