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
    expect(html).toContain("Moy. 30 j · 8h 00");
    expect(html).not.toContain("Regularity");
    expect(html).toContain("lab-signal__value--above");
    expect(html).toContain("lab-signal__value--below");
    expect(html).toContain('aria-label="Sommeil : 8h 30"');
    expect(html).toContain('aria-label="Récupération : 72"');
    expect(html).toContain('aria-label="Effort : 63"');
    expect(html).toContain('aria-label="Calories : 72%"');
    expect(html).toContain('lab-signal__value lab-signal__value--below');
    expect(html).not.toContain("Cible · 3000 kcal");
    expect(html).not.toContain('aria-live="polite" aria-busy');
  });

  it("colors personal lab scores only from their 30-day comparison", () => {
    const html = renderToStaticMarkup(createElement(PersonalLabMetrics, { data: {
      sleepMinutes: 510,
      recoveryScore: 70,
      effortScore: 20,
      caloriesKcal: null,
      averageSleepMinutes: 480,
      averageRecoveryScore: 70,
      averageEffortScore: 30,
      averageCaloriesKcal: 2_500,
      history: [],
    } }));

    expect(html).toContain('class="personal-lab-metric personal-lab-metric--above" data-trend="above"');
    expect(html.match(/data-trend="neutral"/g)).toHaveLength(2);
    expect(html).toContain('class="personal-lab-metric personal-lab-metric--below" data-trend="below"');
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

    expect(html).toContain("Historique des cinq derniers jours : 11 sept. 2026 : 8h 30, 10 sept. 2026 : —");
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
