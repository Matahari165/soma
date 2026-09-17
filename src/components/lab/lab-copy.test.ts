import { describe, expect, it } from "vitest";

import { localizedMetricLabel, localizedMetricUnit } from "./lab-copy";

describe("Personal Lab display copy", () => {
  it("localizes canonical metric labels without changing their ids", () => {
    expect(localizedMetricLabel("sleep_minutes", "Sleep duration")).toBe("Sleep duration");
    expect(localizedMetricLabel("journal:Breakfast", "Breakfast")).toBe("Breakfast");
    expect(localizedMetricLabel("journal:custom", "Custom measure")).toBe("Custom measure");
  });

  it("localizes registry units while preserving technical units", () => {
    expect(localizedMetricUnit("steps")).toBe("steps");
    expect(localizedMetricUnit("min")).toBe("min");
  });
});
