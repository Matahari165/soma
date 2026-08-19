import { describe, expect, it } from "vitest";

import { buildPreviewAnalytics } from "@/services/health-analytics";

import { previewDashboard, previewScoreHistory } from "./local-preview";

describe("local preview health contract", () => {
  it("uses the same current scores on Today and detailed health pages", () => {
    const analytics = buildPreviewAnalytics();
    for (const metric of previewDashboard.scores) {
      const detailedScore = analytics.scores.findLast((score) => score.kind === metric.kind)?.score;
      expect(detailedScore).toBe(metric.score);
      expect(metric.history).toEqual(previewScoreHistory[metric.kind]);
    }
  });

  it("keeps the latest visible metrics aligned with Today", () => {
    const latest = buildPreviewAnalytics().days.at(-1);
    expect(latest).toMatchObject({
      sleep_minutes: 468,
      sleep_need_minutes: 490,
      sleep_regularity: 84,
      hrv_ms: 57,
      resting_heart_rate: 57,
      steps: 8_900,
      zone_minutes: 33,
    });
  });
});
