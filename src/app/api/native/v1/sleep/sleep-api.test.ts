import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { getSleepAnalyticsForUser } from "@/services/health-analytics";
import { GET } from "./route";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/services/health-analytics", () => ({ getSleepAnalyticsForUser: vi.fn() }));

const analytics = {
  timezone: "Europe/Zurich",
  importedAt: "2026-09-19T05:00:00.000Z",
  days: [{ metric_date: "2026-09-19", sleep_minutes: 0, sleep_regularity: null }],
  scores: [],
  sleepRecommendation: null,
  latestSleepStages: [],
  heartRateSamples: [],
  exercises: [],
  effortTargets: {},
  effortTargetSource: "fallback",
};

describe("native sleep API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBearerSessionUser).mockResolvedValue({ id: "user-1", email: null, displayName: "Test" });
    vi.mocked(getSleepAnalyticsForUser).mockResolvedValue(analytics as never);
  });

  it("requires a native bearer session", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getSleepAnalyticsForUser).not.toHaveBeenCalled();
  });

  it("returns the canonical sleep analytics without collapsing zero or missing", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.days[0].sleep_minutes).toBe(0);
    expect(body.days[0].sleep_regularity).toBeNull();
    expect(body).not.toHaveProperty("heartRateSamples");
    expect(body).not.toHaveProperty("exercises");
    expect(getSleepAnalyticsForUser).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1" }));
  });

  it("does not expose internal failures", async () => {
    vi.mocked(getSleepAnalyticsForUser).mockRejectedValue(new Error("private database detail"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Sleep data could not be loaded." });
  });
});
