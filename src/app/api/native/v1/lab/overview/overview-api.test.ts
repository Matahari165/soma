import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { createPersonalLabStream } from "@/services/personal-lab";

import { GET } from "./route";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/services/personal-lab", () => ({ createPersonalLabStream: vi.fn() }));

const user = { id: "user-native", email: "native@example.test", displayName: "Native User" };

const overview = {
  todayDate: "2026-09-19",
  overnightFingerprint: "fingerprint",
  greetingName: "Native User",
  timeZone: "Europe/Zurich",
  today: {
    sleepMinutes: 0,
    sleepRegularity: null,
    recoveryScore: null,
    effortScore: 0,
    effortCoverage: 0,
    caloriesKcal: null,
    calorieTarget: null,
    averageSleepMinutes: null,
    averageSleepRegularity: null,
    averageRecoveryScore: null,
    averageEffortScore: 0,
    averageCaloriesKcal: null,
    history: [],
    deepWorkMinutes: null,
    calendarDeepWorkMinutes: null,
    deepWorkSource: "missing",
    focus: null,
    energy: null,
    activity: null,
  },
};

describe("native Personal Lab overview API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBearerSessionUser).mockResolvedValue(user);
  });

  it("requires a native bearer session", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(createPersonalLabStream).not.toHaveBeenCalled();
  });

  it("returns the server overview with private caching and provenance", async () => {
    vi.mocked(createPersonalLabStream).mockReturnValue({ overview: Promise.resolve(overview) } as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const payload = await response.json();
    expect(payload.today.sleepMinutes).toBe(0);
    expect(payload.today.recoveryScore).toBeNull();
    expect(payload.today.caloriesKcal).toBeNull();
    expect(payload.today.provenance).toEqual({
      sleep: { kind: "health_source", label: "Sources santé importées" },
      sleepRegularity: { kind: "health_source", label: "Sources santé importées" },
      recovery: { kind: "soma_calculation", label: "Calcul Soma" },
      effort: { kind: "soma_calculation", label: "Calcul Soma" },
      calories: { kind: "soma_meals", label: "Repas confirmés" },
      calorieTarget: { kind: "soma_calculation", label: "Cible nutritionnelle Soma" },
      averages: { kind: "soma_calculation", label: "Moyennes Soma" },
    });
    expect(createPersonalLabStream).toHaveBeenCalledWith(user, { includeAnalysis: false });
  });

  it("masks service failures", async () => {
    vi.mocked(createPersonalLabStream).mockReturnValue({ overview: Promise.reject(new Error("private storage detail")) } as never);

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "The Personal Lab overview could not be loaded." });
  });
});
