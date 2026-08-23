import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WhoopImportCard } from "./whoop-import-card";

describe("WhoopImportCard", () => {
  it("starts with an accessible JSON picker and disabled import action", () => {
    const markup = renderToStaticMarkup(createElement(WhoopImportCard));

    expect(markup).toContain("Import WHOOP history");
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept="application/json,.json"');
    expect(markup).toContain("disabled");
  });
});
