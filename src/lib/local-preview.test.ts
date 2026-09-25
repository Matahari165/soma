import { describe, expect, it } from "vitest";

import { buildPreviewAnalytics } from "@/services/health-analytics";
import { previewData } from "@/services/personal-lab-preview";

import { previewDashboard, previewScoreHistory } from "./local-preview";

describe("local preview health contract", () => {
  it("shares the same daily activity scores and measurements between Home and Activity", () => {
    const home = previewData();
    const activity = buildPreviewAnalytics();
    for (const day of activity.days.slice(-30)) {
      const homeDay = home.health.find((item) => item.metric_date === day.metric_date);
      const homeScore = home.scores.find((item) => item.kind === "effort" && item.score_date === day.metric_date);
      const activityScore = activity.scores.find((item) => item.kind === "effort" && item.score_date === day.metric_date);
      expect(homeDay?.steps).toBe(day.steps);
      expect(homeDay?.zone_minutes).toBe(day.zone_minutes);
      expect(homeDay?.exercise_minutes).toBe(day.exercise_minutes);
      expect(homeScore?.score).toBe(activityScore?.score);
    }
  });

  it("uses the same current scores on Today and detailed health pages", () => {
    const analytics = buildPreviewAnalytics();
    for (const metric of previewDashboard.scores) {
      const detailedScore = analytics.scores.findLast((score) => score.kind === metric.kind)?.score;
      expect(detailedScore).toBe(metric.score);
      expect(metric.history).toEqual(previewScoreHistory[metric.kind]);
    }
    expect(previewDashboard.scores.find((metric) => metric.kind === "sleep")?.score).toBe(93);
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

  it("uses the declared wake time and sleep target for the bedtime recommendation", () => {
    expect(buildPreviewAnalytics().sleepRecommendation).toMatchObject({
      wakeTimeMinutes: 7 * 60,
      sleepNeedMinutes: 510,
    });
  });
});
