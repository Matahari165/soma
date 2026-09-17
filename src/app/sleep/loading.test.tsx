import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("sleep loading state", () => {
  it("uses the shared secondary-page loading shell", () => {
    const html = renderToStaticMarkup(createElement(Loading));

    expect(html).toContain('data-health-kind="sleep"');
    expect(html).toContain("Sleep");
    expect(html).not.toContain("Sleep score");
    expect(html).not.toContain("health-hero-metrics");
  });
});
