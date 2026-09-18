import { describe, expect, it } from "vitest";
import { ARRIVAL_PHRASE_COUNTS, arrivalActivityFor, arrivalMessageFor, arrivalMomentFor } from "./arrival-message";

describe("arrival message personalization", () => {
  it("keeps the wake window centered on 07:00", () => {
    expect(arrivalMomentFor(6 * 60 + 29)).toBe("night");
    expect(arrivalMomentFor(6 * 60 + 30)).toBe("wake");
    expect(arrivalMomentFor(7 * 60)).toBe("wake");
    expect(arrivalMomentFor(7 * 60 + 29)).toBe("wake");
    expect(arrivalMomentFor(7 * 60 + 30)).toBe("morning");
    expect(arrivalMomentFor(12 * 60)).toBe("afternoon");
    expect(arrivalMomentFor(18 * 60)).toBe("evening");
    expect(arrivalMomentFor(22 * 60 + 30)).toBe("night");
  });

  it("only calls out a reliable run or a sustained high-intensity signal", () => {
    expect(arrivalActivityFor({ vigorousZoneMinutes: 7, peakZoneMinutes: 4 })).toBeNull();
    expect(arrivalActivityFor({ vigorousZoneMinutes: 18, peakZoneMinutes: 2 })).toEqual({ kind: "intense", intensityMinutes: 20 });
    expect(arrivalActivityFor({ vigorousZoneMinutes: 12, peakZoneMinutes: 14, runningDistanceKm: 6.4, runningDurationMinutes: 38 })).toEqual({ kind: "run", distanceKm: 6.4, durationMinutes: 38 });
    expect(arrivalActivityFor({ runningDistanceKm: 2, runningDurationMinutes: 12, dataQuality: { presentTypes: ["sleep"] } })).toBeNull();
    expect(arrivalActivityFor({ runningDistanceKm: 0, runningDurationMinutes: 0, vigorousZoneMinutes: null, peakZoneMinutes: null })).toBeNull();
  });

  it("uses the first name and a stable, date-based variation", () => {
    const morning = arrivalMessageFor({ name: "Alex Vance", timeZone: "Europe/Paris", now: new Date("2026-09-12T07:00:00+02:00") });
    const sameMorning = arrivalMessageFor({ name: "Alex Vance", timeZone: "Europe/Paris", now: new Date("2026-09-12T07:14:00+02:00") });
    const nextDay = arrivalMessageFor({ name: "Alex Vance", timeZone: "Europe/Paris", now: new Date("2026-09-13T07:00:00+02:00") });

    expect(morning.lines.join(" ")).toContain("Alex");
    expect(morning).toEqual(sameMorning);
    expect(nextDay.lines.join(" ")).toContain("Alex");
    expect(ARRIVAL_PHRASE_COUNTS.base).toBeGreaterThanOrEqual(50);
    expect(ARRIVAL_PHRASE_COUNTS.run).toBeGreaterThanOrEqual(20);
    expect(ARRIVAL_PHRASE_COUNTS.intense).toBeGreaterThanOrEqual(20);
  });

  it("uses a neutral fallback when name is missing or empty", () => {
    const fallback = arrivalMessageFor({ name: "", timeZone: "Europe/Paris", now: new Date("2026-09-12T07:00:00+02:00") });
    expect(fallback.lines.join(" ")).toContain("Friend");
    expect(fallback.lines.join(" ")).not.toContain("Alex");
  });

  it("adds a concise factual note for the marked activity", () => {
    const run = arrivalMessageFor({ name: "Alex", now: new Date("2026-09-12T20:00:00+02:00"), activity: { kind: "run", distanceKm: 7.2, durationMinutes: 44 } });
    const intense = arrivalMessageFor({ name: "Alex", now: new Date("2026-09-12T15:00:00+02:00"), activity: { kind: "intense", intensityMinutes: 24 } });

    expect(run.activityNote).toBe("Run recorded · 7.2 km · 44 min");
    expect(intense.activityNote).toBe("Intense effort recorded · 24 min in high zones");
    expect(run.lines.join(" ")).toMatch(/run/i);
    expect(intense.lines.join(" ")).toMatch(/effort|strain|intensity/i);
  });
});
