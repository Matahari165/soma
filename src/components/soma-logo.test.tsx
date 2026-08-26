import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SomaLogo } from "./soma-logo";

describe("Soma logo loading motion", () => {
  it("renders a one-shot loading cue without changing the accessible brand", () => {
    const html = renderToStaticMarkup(createElement(SomaLogo));

    expect(html).toContain("soma-logo--loading");
    expect(html).toContain("soma-symbol__liquid-fill");
    expect(html).toContain("soma-symbol__bubbles");
    expect(html.match(/<circle /g)).toHaveLength(3);
    expect(html).toContain("clip-path=\"url(#soma-liquid-clip-");
    expect(html).toContain("<strong>SOMA</strong>");
  });
});
