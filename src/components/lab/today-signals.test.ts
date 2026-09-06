import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TodaySignals } from "./today-signals";

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
    expect(html).toContain("30-day avg · 8h 00");
    expect(html).not.toContain("Regularity");
    expect(html).toContain("lab-signal__value--above");
    expect(html).toContain("lab-signal__value--below");
    expect(html).toContain('aria-label="Sleep duration: 8h 30"');
    expect(html).toContain('aria-label="Recovery: 72"');
    expect(html).toContain('aria-label="Effort: 63"');
    expect(html).toContain('aria-label="Calories: 72%"');
    expect(html).toContain("Cible · 3000 kcal");
    expect(html).not.toContain('aria-live="polite" aria-busy');
  });
});
