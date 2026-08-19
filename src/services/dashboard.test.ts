import { describe, expect, it } from "vitest";

import { selectSignalMetric } from "./dashboard";
import { selectDailyFocus } from "@/components/dashboard/dashboard";
import { previewDashboard } from "@/lib/local-preview";

const base = {
  sleep_need_minutes: null, sleep_regularity: null, bedtime: null, wake_time: null,
  zone_minutes: null, source_freshness: {},
};

describe("dashboard signal dates", () => {
  it("keeps the last complete night when today's row only contains activity", () => {
    const metrics = [
      { ...base, metric_date: "2026-08-07", sleep_minutes: 430, hrv_ms: 48, resting_heart_rate: 59, steps: 8000 },
      { ...base, metric_date: "2026-08-08", sleep_minutes: null, hrv_ms: null, resting_heart_rate: null, steps: 63 },
    ];

    expect(selectSignalMetric("sleep", metrics)?.metric_date).toBe("2026-08-07");
    expect(selectSignalMetric("recovery", metrics)?.metric_date).toBe("2026-08-07");
    expect(selectSignalMetric("effort", metrics)?.metric_date).toBe("2026-08-08");
  });
});

describe("daily focus", () => {
  it("selects a limited or building signal before the lowest healthy score", () => {
    const scores = previewDashboard.scores.map((score) => ({ ...score }));
    scores[0].status = "limited";
    scores[0].score = null;
    expect(selectDailyFocus(scores)?.kind).toBe("sleep");
  });

  it("otherwise selects the lowest available score", () => {
    expect(selectDailyFocus(previewDashboard.scores)?.kind).toBe("effort");
  });
});
