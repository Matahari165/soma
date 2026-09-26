import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateActiveHours } from "@/domain/health/active-hours";
import { buildPreviewAnalytics } from "@/services/health-analytics";
import { buildTodayData } from "@/services/personal-lab-today";
import { ObservatoryRings } from "@/components/lab/observatory-rings";
import { ActivityDetails } from "./activity-details";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => vi.useRealTimers());
describe("Home and Strain score synchronization", () => {
  it("shows the same recomputed score instead of a persisted legacy value or a /21 conversion", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-02T02:30:00Z"));
    const date = "2030-01-02";
    const activeHours = calculateActiveHours({ date, timeZone: "UTC", now: new Date(), records: [{ data_type: "activity-level", civil_date: date, start_time: "2030-01-02T00:00:00Z", end_time: "2030-01-02T02:00:00Z", measured_at: null, payload: { activityLevel: { interval: { startTime: "2030-01-02T00:00:00Z", endTime: "2030-01-02T02:00:00Z" }, activityLevelType: "LIGHTLY_ACTIVE" } } }] });
    const score = { score_date: date, kind: "effort" as const, score: 89, algorithm_version: "effort-v5", drivers: { activityLoadScore: 42, strainMeasurements: { steps: 15_000, zoneMinutes: 45, strengthMinutes: 5, activeHoursProgress: 1 }, strengthMinutes: 5, activeHours } };
    const preview = buildPreviewAnalytics();
    const day = { ...preview.days.at(-1)!, metric_date: date, steps: 15_000, zone_minutes: 45, exercise_minutes: 5 };
    const today = buildTodayData({ timeZone: "UTC", health: [day], scores: [score], calendars: [], checkins: [] });
    expect(today.effortScore).toBe(94);
    const home = renderToStaticMarkup(<ObservatoryRings date={date} data={today} />);
    const strain = renderToStaticMarkup(<ActivityDetails data={{ ...preview, timezone: "UTC", days: [day], scores: [score] }} />);
    expect(home).toContain("Strain : 94, objectif 100");
    expect(strain).toContain("Strain score: 94 out of 100");
    vi.setSystemTime(new Date("2030-01-02T03:30:00Z"));
    const refreshed = buildTodayData({ timeZone: "UTC", health: [day], scores: [score], calendars: [], checkins: [] });
    expect(refreshed.effortScore).toBeNull();
    expect(renderToStaticMarkup(<ObservatoryRings date={date} data={refreshed} />)).toContain("Strain : —");
    expect(renderToStaticMarkup(<ActivityDetails data={{ ...preview, timezone: "UTC", days: [day], scores: [score] }} />)).toContain("Strain score unavailable");
  });
});
