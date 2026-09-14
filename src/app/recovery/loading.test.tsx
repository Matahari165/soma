import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("recovery loading state", () => {
  it("uses the shared secondary-page loading shell", () => {
    const html = renderToStaticMarkup(createElement(Loading));

    expect(html).toContain('data-health-kind="recovery"');
    expect(html).toContain("Récupération");
    expect(html).not.toContain("Score de récupération");
    expect(html).not.toContain("health-hero-metrics");
  });
});
