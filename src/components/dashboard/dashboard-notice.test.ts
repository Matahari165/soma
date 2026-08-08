import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HealthConnectedNotice } from "./dashboard";

describe("Google Health dashboard notice", () => {
  it("confirms the connection without implying the background import is complete", () => {
    const markup = renderToStaticMarkup(createElement(HealthConnectedNotice));

    expect(markup).toContain("Google Health connected");
    expect(markup).toContain("import is running in the background");
    expect(markup).toContain("/settings?health=connected");
  });
});
