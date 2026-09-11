import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("global loading state", () => {
  it("uses a compact French loading treatment", () => {
    const html = renderToStaticMarkup(createElement(Loading));

    expect(html).toContain('lang="fr"');
    expect(html).toContain('aria-label="Chargement des données Soma"');
    expect(html).toContain("Chargement de Soma");
    expect(html).not.toContain("Preparing");
    expect(html).not.toContain("system-loading__metrics");
  });
});
