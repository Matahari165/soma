import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SomaLogo } from "./soma-logo";

describe("Soma logo", () => {
  it("renders the stable accessible brand without a loading animation", () => {
    const html = renderToStaticMarkup(createElement(SomaLogo));

    expect(html).not.toContain("soma-logo--loading");
    expect(html).toContain("soma-symbol__liquid-fill");
    expect(html).toContain("soma-symbol__bubbles");
    expect(html.match(/<circle /g)).toHaveLength(3);
    expect(html).toContain("clip-path=\"url(#soma-liquid-clip-");
    expect(html).toContain("<strong>SOMA</strong>");
  });
});
