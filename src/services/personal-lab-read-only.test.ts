import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalLabSnapshot } from "./personal-lab-types";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  loadPersonalLabMatrixData: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => false }));
vi.mock("./personal-lab-data", () => ({
  loadPersonalLabData: vi.fn(),
  loadPersonalLabMatrixData: mocks.loadPersonalLabMatrixData,
}));

import { getPersonalLabMatrixWithTimings } from "./personal-lab";

const matrix: PersonalLabSnapshot["matrix"] = {
  analysisEndDate: "2026-09-26",
  outcomes: [],
  rows: [],
  periods: [15],
  meaningfulRelations: [],
  topRelations: [],
  acuteHighlights: [],
  chronicHighlights: [],
  coverageByMetric: [],
  collectionProgress: [],
};

describe("read-only Personal Lab matrix loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPersonalLabMatrixData.mockResolvedValue({
      matrix,
      timeZone: "Europe/Paris",
      todayDate: "2026-09-26",
      inputRevision: "revision-1",
      cacheKey: "15",
      cacheStatus: "miss",
      timings: { cacheMs: 1, dataMs: 0 },
    });
  });

  it("does not schedule cache or history writes when detail is read-only", async () => {
    const result = await getPersonalLabMatrixWithTimings({ id: "user-1", email: null, displayName: "" }, 15, { persist: false });

    expect(result.matrix).toEqual(matrix);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("keeps deferred writes enabled for existing callers by default", async () => {
    await getPersonalLabMatrixWithTimings({ id: "user-1", email: null, displayName: "" }, 15);

    expect(mocks.after).toHaveBeenCalledTimes(1);
  });
});
