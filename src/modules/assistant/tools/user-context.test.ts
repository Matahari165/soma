import { afterEach, describe, expect, it, vi } from "vitest";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { loadActiveAssistantPlans, loadAssistantPlansNeedingReview, loadConfirmedAssistantMemories, loadConfirmedGoalContext, loadPendingAssistantChanges } from "../repository";
import { loadAssistantUserContext } from "./user-context";

vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: vi.fn() }));
vi.mock("../repository", () => ({
  loadActiveAssistantPlans: vi.fn(),
  loadAssistantPlansNeedingReview: vi.fn(),
  loadConfirmedAssistantMemories: vi.fn(),
  loadConfirmedGoalContext: vi.fn(),
  loadPendingAssistantChanges: vi.fn(),
}));

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("assistant user context", () => {
  it("supplies a compact confirmed-plan inventory and uses the profile's local date for memories", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T22:30:00Z"));
    vi.mocked(createCloudflareAdminClient).mockReturnValue({
      from: (table: string) => table === "profiles"
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "Europe/Zurich", date_of_birth: null, height_cm: null, weight_kg: null, sex_for_health_calculations: null }, error: null }) }) }) }
        : { select: () => ({ eq: () => ({ is: () => ({ order: async () => ({ data: [], error: null }) }) }) }) },
    } as never);
    vi.mocked(loadConfirmedGoalContext).mockResolvedValue(null);
    vi.mocked(loadConfirmedAssistantMemories).mockResolvedValue([]);
    vi.mocked(loadPendingAssistantChanges).mockResolvedValue({ memories: [], goalSets: [], planVersions: [] });
    vi.mocked(loadActiveAssistantPlans).mockResolvedValue({ complete: true, activePlans: [{
      id: "00000000-0000-4000-8000-000000000001", goal_set_id: null, updated_at: "2026-09-22T22:00:00Z",
      confirmedVersion: { id: "00000000-0000-4000-8000-000000000002", version: 2, confirmed_at: "2026-09-22T22:00:00Z", body: {
        title: "Progression course", objectiveSummary: "Développer l'endurance", detailedThrough: "2026-10-01", reviewOn: "2026-10-02",
        phases: [], sections: [{ domain: "running", title: "Séances", content: [{ title: "Sortie facile", description: "Détail réservé à la lecture ciblée", scheduledFor: null, successCriteria: [] }] }],
      } },
    }] });
    vi.mocked(loadAssistantPlansNeedingReview).mockResolvedValue([]);

    const context = await loadAssistantUserContext("user-1");
    expect(loadConfirmedAssistantMemories).toHaveBeenCalledWith("user-1", "2026-09-23");
    expect(context.activePlans[0]).toMatchObject({ title: "Progression course", version: 2, status: "confirmed", sections: [{ itemCount: 1 }] });
    expect(JSON.stringify(context)).not.toContain("Détail réservé à la lecture ciblée");
    expect(context.confirmedMemoriesComplete).toBe(true);
  });

  it("does not depend on legacy goals after a coach goal is confirmed", async () => {
    vi.mocked(createCloudflareAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table !== "profiles") throw new Error("Legacy goal storage is unavailable");
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "Europe/Zurich" }, error: null }) }) }) };
      },
    } as never);
    vi.mocked(loadConfirmedGoalContext).mockResolvedValue({ goalSet: { id: "set-1", primary_direction: "Développer la force", primary_goal_type: "build_muscle", secondary_directions: [] }, goals: [] });
    vi.mocked(loadConfirmedAssistantMemories).mockResolvedValue([]);
    vi.mocked(loadPendingAssistantChanges).mockResolvedValue({ memories: [], goalSets: [], planVersions: [] });
    vi.mocked(loadActiveAssistantPlans).mockResolvedValue({ complete: true, activePlans: [] });
    vi.mocked(loadAssistantPlansNeedingReview).mockResolvedValue([]);
    const context = await loadAssistantUserContext("user-1");
    expect(context.legacyGoals).toEqual([]);
    expect(context.confirmedGoals?.goalSet.primary_direction).toBe("Développer la force");
  });
});
