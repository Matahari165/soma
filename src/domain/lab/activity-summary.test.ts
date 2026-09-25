import { describe, expect, it } from "vitest";

import { summarizePersonalLabActivities, type PersonalLabActivityRecord } from "./activity-summary";

const base: PersonalLabActivityRecord = {
  date: "2026-09-25",
  name: "Run",
  type: "RUNNING",
  durationMinutes: null,
  distanceKm: null,
  averagePaceSecondsPerKm: null,
  averageHeartRate: null,
  maximumHeartRate: null,
  calories: null,
};

describe("daily activity summary", () => {
  it("counts every session and selects the longest recorded session", () => {
    const days = summarizePersonalLabActivities([
      { ...base, name: "Short run", durationMinutes: 28 },
      { ...base, name: "Long ride", type: "CYCLING", durationMinutes: 94, distanceKm: 31 },
      { ...base, date: "2026-09-24", name: "Walk", durationMinutes: 42 },
    ]);

    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: "2026-09-25", count: 2, activity: { name: "Long ride", durationMinutes: 94, distanceKm: 31 } });
  });

  it("keeps a missing measure distinct from an explicit zero", () => {
    const [day] = summarizePersonalLabActivities([
      { ...base, name: "Unmeasured", durationMinutes: null, calories: null },
      { ...base, name: "Measured zero", durationMinutes: 0, calories: 0 },
    ]);

    expect(day.count).toBe(2);
    expect(day.activity).toMatchObject({ name: "Measured zero", durationMinutes: 0, calories: 0 });
  });
});
