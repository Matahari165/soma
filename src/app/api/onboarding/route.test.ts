import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@/lib/auth";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { ensureJournalVariables } from "@/services/journal";

import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: vi.fn(),
}));

vi.mock("@/services/journal", () => ({
  ensureJournalVariables: vi.fn(),
}));

describe("POST /api/onboarding", () => {
  const rpcMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCloudflareAdminClient).mockReturnValue({
      rpc: rpcMock,
    } as never);
  });

  it("returns 401 when user is unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const request = new Request("https://soma.fit/api/onboarding", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("completes onboarding and initializes selected journal variables", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "test-user-1",
      email: "test@soma.fit",
      displayName: "Test User",
    });

    rpcMock.mockResolvedValue({ error: null });
    vi.mocked(ensureJournalVariables).mockResolvedValue(undefined);

    const payload = {
      displayName: "Test User",
      dateOfBirth: "1995-05-15",
      heightCm: 180,
      weightKg: 75,
      sexForHealthCalculations: "male",
      primaryGoal: "build_muscle",
      secondaryGoal: "improve_endurance",
      baseSleepTargetMinutes: 480, // 8 hours
      usualWakeTime: "07:00",
      importRange: "90_days",
      timezone: "Europe/Paris",
      selectedHabits: ["Reading for 20 minutes", "Magnesium"],
      customHabits: [{ name: "Cold Shower", category: "activity", emoji: "🚿" }],
    };

    const request = new Request("https://soma.fit/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);

    expect(rpcMock).toHaveBeenCalledWith(
      "complete_soma_onboarding",
      expect.objectContaining({
        p_user_id: "test-user-1",
        p_base_sleep_target_minutes: 480,
        p_display_name: "Test User",
      }),
    );

    expect(ensureJournalVariables).toHaveBeenCalledWith("test-user-1", {
      selectedHabitNames: ["Reading for 20 minutes", "Magnesium"],
      customHabits: [{ name: "Cold Shower", category: "activity", emoji: "🚿" }],
    });
  });
});
