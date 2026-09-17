import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("recovery loading state", () => {
  it("uses the shared secondary-page loading shell", () => {
    const html = renderToStaticMarkup(createElement(Loading));

    expect(html).toContain('data-health-kind="recovery"');
    expect(html).toContain("Recovery");
    expect(html).not.toContain("Recovery score");
    expect(html).not.toContain("health-hero-metrics");
  });
});
