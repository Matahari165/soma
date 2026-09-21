import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("meals loading state", () => {
  it("uses a compact English loading treatment", () => {
    const html = renderToStaticMarkup(createElement(Loading));

    expect(html).toContain('lang="en"');
    expect(html).toContain('aria-label="Loading nutrition data"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading nutrition");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("system-loading__metrics");
    expect(html).toContain("system-loading__canvas");
    expect(html).not.toContain("system-loading__status");
    expect(html).not.toContain("<i");
  });
});
