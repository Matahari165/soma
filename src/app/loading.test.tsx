import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("global loading state", () => {
  it("uses a compact English loading treatment", () => {
    const html = renderToStaticMarkup(createElement(Loading));

    expect(html).toContain('lang="en"');
    expect(html).toContain('aria-label="Loading Soma data"');
    expect(html).toContain("Loading Soma");
    expect(html).not.toContain("Preparing");
    expect(html).not.toContain("system-loading__metrics");
    expect(html).toContain("system-loading__canvas");
    expect(html).not.toContain("system-loading__status");
    expect(html).not.toContain("<i");
  });
});
