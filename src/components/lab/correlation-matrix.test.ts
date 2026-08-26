import { afterEach, describe, expect, it, vi } from "vitest";

import { matrixScrollBehavior, periodLabel } from "./correlation-matrix";

describe("relationship matrix motion helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("formats the four analysis period labels", () => {
    expect(periodLabel(15)).toBe("15d");
    expect(periodLabel(30)).toBe("30d");
    expect(periodLabel(90)).toBe("90d");
    expect(periodLabel("all")).toBe("All");
  });

  it("uses an instant scroll when reduced motion is enabled", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });

    expect(matrixScrollBehavior()).toBe("auto");
  });

  it("keeps smooth scrolling available when motion is allowed", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    expect(matrixScrollBehavior()).toBe("smooth");
  });
});
