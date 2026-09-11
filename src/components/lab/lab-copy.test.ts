import { describe, expect, it } from "vitest";

import { localizedMetricLabel, localizedMetricUnit } from "./lab-copy";

describe("Personal Lab display copy", () => {
  it("localizes canonical metric labels without changing their ids", () => {
    expect(localizedMetricLabel("sleep_minutes", "Sleep duration")).toBe("Durée du sommeil");
    expect(localizedMetricLabel("journal:Breakfast", "Breakfast")).toBe("Petit déjeuner");
    expect(localizedMetricLabel("journal:custom", "Custom measure")).toBe("Custom measure");
  });

  it("localizes registry units while preserving technical units", () => {
    expect(localizedMetricUnit("steps")).toBe("pas");
    expect(localizedMetricUnit("min")).toBe("min");
  });
});
