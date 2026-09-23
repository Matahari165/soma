import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { loadConfirmedGoalContext } from "@/modules/assistant/repository";
import { goalTypeForDirection, loadActiveGoal } from "./active-goals";

vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: vi.fn() }));
vi.mock("@/modules/assistant/repository", () => ({ loadConfirmedGoalContext: vi.fn() }));

describe("canonical active goal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the confirmed coach goal without consulting the old profile goal", async () => {
    vi.mocked(loadConfirmedGoalContext).mockResolvedValue({
      goalSet: { id: "set-1", primary_direction: "Développer la force et la masse musculaire", primary_goal_type: "build_muscle", secondary_directions: ["Améliorer la course"] },
      goals: [],
    });
    await expect(loadActiveGoal("user-1")).resolves.toEqual({
      type: "build_muscle", direction: "Développer la force et la masse musculaire",
      secondaryDirections: ["Améliorer la course"], source: "assistant",
    });
    expect(createCloudflareAdminClient).not.toHaveBeenCalled();
  });

  it("uses the earlier profile goal only before a confirmed coach goal exists", async () => {
    vi.mocked(loadConfirmedGoalContext).mockResolvedValue(null);
    vi.mocked(createCloudflareAdminClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { goal_type: "improve_endurance", custom_label: "Courir plus loin" }, error: null }) }) }) }) }) }),
    } as never);
    await expect(loadActiveGoal("user-1")).resolves.toEqual({
      type: "improve_endurance", direction: "Courir plus loin", secondaryDirections: [], source: "profile",
    });
  });

  it("classifies old free-form directions conservatively", () => {
    expect(goalTypeForDirection("Prise de masse musculaire")).toBe("build_muscle");
    expect(goalTypeForDirection("Équilibre personnel")).toBe("other");
  });
});
