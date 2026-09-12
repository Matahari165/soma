import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SomaLogo } from "./soma-logo";

describe("Soma logo", () => {
  it("renders the stable accessible brand without a loading animation", () => {
    const html = renderToStaticMarkup(createElement(SomaLogo));

    expect(html).not.toContain("soma-logo--loading");
    expect(html).toContain("soma-symbol__mark");
    expect(html).toContain("/icons/soma-192.png");
    expect(html).toContain("<strong>SOMA</strong>");
  });
});
