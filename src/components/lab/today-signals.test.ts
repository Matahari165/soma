import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { applyMealTotals, mergePersonalLabMetricRefresh, PersonalLabMetrics, TodaySignals } from "./today-signals";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("Today signals", () => {
  it("shows the three health signals followed by the calorie score", () => {
    const html = renderToStaticMarkup(createElement(TodaySignals, { initial: { sleepMinutes: 510, sleepRegularity: 84, recoveryScore: 72, effortScore: 63, averageSleepMinutes: 480, averageSleepRegularity: 78, averageRecoveryScore: 70, averageEffortScore: 65, calorieProgress: 72, calorieTarget: 3000, overnightFingerprint: null } }));
    expect(html.match(/<a /g)).toHaveLength(4);
    expect(html).toContain('href="/sleep"');
    expect(html).toContain('href="/recovery"');
    expect(html).toContain('href="/activity"');
    expect(html).toContain('href="/meals"');
    expect(html).not.toContain('href="/effort"');
    expect(html).toContain("30d avg · 8h 00");
    expect(html).not.toContain("Regularity");
    expect(html).toContain("lab-signal__value--above");
    expect(html).toContain("lab-signal__value--below");
    expect(html).toContain('aria-label="Sleep: 8h 30"');
    expect(html).toContain('aria-label="Recovery: 72"');
    expect(html).toContain('aria-label="Activity: 63"');
    expect(html).toContain('aria-label="Calories: 72%"');
    expect(html).toContain('lab-signal__value lab-signal__value--below');
    expect(html).not.toContain("Target · 3,000 kcal");
    expect(html).not.toContain('aria-live="polite" aria-busy');
  });

  it("colors personal lab scores only from their 30-day comparison", () => {
    const html = renderToStaticMarkup(createElement(PersonalLabMetrics, { data: {
      sleepMinutes: 510,
      recoveryScore: 70,
      effortScore: 20,
      caloriesKcal: null,
      calorieTarget: 3_050,
      averageSleepMinutes: 480,
      averageRecoveryScore: 70,
      averageEffortScore: 30,
      averageCaloriesKcal: 2_500,
      history: [],
    } }));

    expect(html).toContain('class="personal-lab-metric personal-lab-metric--above" data-trend="above"');
    expect(html.match(/data-trend="neutral"/g)).toHaveLength(2);
    expect(html).toContain('class="personal-lab-metric personal-lab-metric--below" data-trend="below"');
    expect(html).toContain("Target 3,050");
    expect(html).toContain("20</span><small class=\"personal-lab-metric__denominator\" aria-hidden=\"true\">/100</small>");
    expect(html).not.toContain("/21");
  });

  it("keeps the five-day metric history localized for assistive technology", () => {
    const html = renderToStaticMarkup(createElement(PersonalLabMetrics, { data: {
      sleepMinutes: 510,
      recoveryScore: null,
      effortScore: null,
      caloriesKcal: null,
      averageSleepMinutes: 480,
      averageRecoveryScore: null,
      averageEffortScore: null,
      averageCaloriesKcal: null,
      history: [
        { date: "2026-09-11", sleepMinutes: 510, recoveryScore: null, effortScore: null, caloriesKcal: null },
        { date: "2026-09-10", sleepMinutes: null, recoveryScore: null, effortScore: null, caloriesKcal: null },
      ],
    } }));

    expect(html).toContain("Last 5 days history: Sep 11, 2026: 8h 30, Sep 10, 2026: —");
    expect(html).not.toContain("2026-09-11");
  });

  it("refreshes the current meal value and 30-day calorie average after a meal event", () => {
    const initial = {
      sleepMinutes: null,
      recoveryScore: null,
      effortScore: null,
      caloriesKcal: null,
      averageSleepMinutes: null,
      averageRecoveryScore: null,
      averageEffortScore: null,
      averageCaloriesKcal: 2_500,
      history: [{ date: "2026-09-11", sleepMinutes: null, recoveryScore: null, effortScore: null, caloriesKcal: null }],
    };
    const locallyUpdated = applyMealTotals(initial, {
      date: "2026-09-11",
      isToday: true,
      calories: 3_100,
      calorieTarget: 3_000,
      calorieProgress: 103,
    });
    const refreshed = mergePersonalLabMetricRefresh(locallyUpdated, {
      averageCaloriesKcal: 2_600,
      history: [{ date: "2026-09-11", sleepMinutes: null, recoveryScore: null, effortScore: null, caloriesKcal: 3_100 }],
    });

    expect(locallyUpdated.caloriesKcal).toBe(3_100);
    expect(locallyUpdated.history[0]?.caloriesKcal).toBe(3_100);
    expect(refreshed.averageCaloriesKcal).toBe(2_600);
    expect(refreshed.history[0]?.caloriesKcal).toBe(3_100);
  });

  it("keeps the current target only when a partial refresh omits it", () => {
    const values = {
      sleepMinutes: null,
      recoveryScore: null,
      effortScore: 80,
      caloriesKcal: null,
      calorieTarget: 3_300,
      averageSleepMinutes: null,
      averageRecoveryScore: null,
      averageEffortScore: 40,
      averageCaloriesKcal: null,
      history: [],
    };
    // La dernière cible reçue fait foi même si elle est plus basse : pas de max conservé.
    expect(mergePersonalLabMetricRefresh(values, { calorieTarget: 3_000 }).calorieTarget).toBe(3_000);
    expect(mergePersonalLabMetricRefresh(values, { calorieTarget: null }).calorieTarget).toBe(3_300);
    expect(mergePersonalLabMetricRefresh(values, {}).calorieTarget).toBe(3_300);
    expect(mergePersonalLabMetricRefresh(values, { calorieTarget: 3_350 }).calorieTarget).toBe(3_350);
  });

  it("ignores meal totals belonging to another date", () => {
    const initial = {
      sleepMinutes: null,
      recoveryScore: null,
      effortScore: null,
      caloriesKcal: 2_400,
      averageSleepMinutes: null,
      averageRecoveryScore: null,
      averageEffortScore: null,
      averageCaloriesKcal: 2_500,
      history: [{ date: "2026-09-11", sleepMinutes: null, recoveryScore: null, effortScore: null, caloriesKcal: 2_400 }],
    };
    expect(applyMealTotals(initial, {
      date: "2026-09-10",
      isToday: false,
      calories: 3_100,
      calorieTarget: 3_000,
      calorieProgress: 103,
    })).toBe(initial);
  });
});
