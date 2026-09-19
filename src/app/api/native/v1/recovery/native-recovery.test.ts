import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { buildNativeRecoveryResponse, getNativeRecovery } from "@/services/native-recovery";

import { GET } from "./route";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/services/native-recovery", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/native-recovery")>();
  return { ...original, getNativeRecovery: vi.fn() };
});

const user = { id: "user-native", email: "native@example.test", displayName: "Native User" };
const day = (date: string, hrv: number | null, restingHeartRate: number | null) => ({
  metric_date: date,
  sleep_minutes: 450,
  hrv_ms: hrv,
  resting_heart_rate: restingHeartRate,
  source_freshness: { latestMeasuredAt: `${date}T07:00:00.000Z` },
});

describe("native Recovery API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBearerSessionUser).mockResolvedValue(user);
  });

  it("requires a native bearer session", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns the scoped Recovery payload without caching it", async () => {
    vi.mocked(getNativeRecovery).mockResolvedValue({ latestDate: "2026-09-19" } as never);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ latestDate: "2026-09-19" });
    expect(getNativeRecovery).toHaveBeenCalledWith(user.id);
  });

  it("keeps missing measurements distinct from measured zero", () => {
    const response = buildNativeRecoveryResponse({
      timezone: "Europe/Zurich",
      importedAt: "2026-09-19T08:00:00.000Z",
      days: [day("2026-09-18", 52, 58), day("2026-09-19", 0, null)],
      scores: [],
    });
    expect(response.signals.hrv.current).toBe(0);
    expect(response.signals.restingHeartRate.current).toBeNull();
    expect(response.trends.restingHeartRate.at(-1)?.value).toBeNull();
    expect(response.score.value).toBeNull();
    expect(response.score.reason).toContain("fréquence cardiaque au repos est absente");
  });

  it("only exposes a persisted calculable score and its real personal references", () => {
    const days = Array.from({ length: 8 }, (_, index) => day(`2026-09-${String(12 + index).padStart(2, "0")}`, 48 + index, 62 - index));
    const response = buildNativeRecoveryResponse({
      timezone: "Europe/Zurich",
      importedAt: "2026-09-19T08:00:00.000Z",
      days,
      scores: [{ score_date: "2026-09-19", kind: "recovery", score: 73, drivers: { hrv: 76, restingHeartRate: 70, sleep: 71, coverage: 1 }, algorithm_version: "recovery-v1" }],
    });
    expect(response.score).toMatchObject({ value: 73, reason: null, measuredDays: 1, coverage: 1, algorithmVersion: "recovery-v1" });
    expect(response.score.components).toMatchObject({ hrv: { value: 76, weight: 0.4 }, restingHeartRate: { value: 70, weight: 0.3 }, sleep: { value: 71, weight: 0.3 } });
    expect(response.signals.hrv).toMatchObject({ current: 55, reference: 51.5, measuredDays: 8 });
    expect(response.provenance.measurements.kind).toBe("health_source");
    expect(response.provenance.score.kind).toBe("soma_calculation");
  });

  it("does not leak internal errors", async () => {
    vi.mocked(getNativeRecovery).mockRejectedValue(new Error("private storage detail"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Recovery data could not be loaded." });
  });
});
