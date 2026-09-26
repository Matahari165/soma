import { describe, expect, it } from "vitest";

import { sleepMetricComparisonLabel, sleepMetricTone, sleepNeedComparisonLabel, sleepNeedTone } from "./sleep-comparison";

describe("sleep comparisons", () => {
  it("uses each metric's favorable direction and rounded display values", () => {
    expect(sleepMetricTone(95, 90, "higher_is_better")).toBe("positive");
    expect(sleepMetricTone(45, 50, "lower_is_better")).toBe("positive");
    expect(sleepMetricTone(58, 58.4, "higher_is_better")).toBe("neutral");
    expect(sleepMetricComparisonLabel(50, null, "higher_is_better")).toBe("30-day comparison unavailable");
  });

  it("treats duration as meeting estimated need, not a metric that keeps improving", () => {
    expect(sleepNeedTone(480, 480)).toBe("positive");
    expect(sleepNeedTone(540, 480)).toBe("positive");
    expect(sleepNeedTone(479, 480)).toBe("negative");
    expect(sleepNeedTone(480, null)).toBe("neutral");
    expect(sleepNeedComparisonLabel(540, 480)).toBe("Estimated sleep need met");
    expect(sleepNeedComparisonLabel(479, 480)).toBe("Below estimated sleep need");
    expect(sleepNeedComparisonLabel(null, 480)).toBe("Sleep duration unavailable");
  });
});
