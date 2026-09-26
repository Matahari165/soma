import { describe, expect, it } from "vitest";
import type { AnalysisPeriod } from "@/domain/lab/matrix";
import { previewData } from "./personal-lab-preview";
import { buildPersonalLabMatrix, buildSnapshot } from "./personal-lab-snapshot";

// Real builders, no mocked matrix: removing secondary snapshot inputs must
// preserve rows, coefficients, ranking, nulls, coverage and periods exactly.
describe("dedicated matrix parity", () => {
  it.each<AnalysisPeriod>([15, 30, 90, "all"])("matches the full snapshot for period %s", (period) => {
    const input = { ...previewData(), user: { id: "test-user", email: null, displayName: "Demo" }, timeZone: "Europe/Paris", connections: [], metricPreferences: [], requestedPeriods: [period] };
    const snapshot = buildSnapshot(input);
    const matrix = buildPersonalLabMatrix({ ...input, calendars: [], checkins: [] });
    expect(matrix).toEqual(snapshot.matrix);
  });
});
