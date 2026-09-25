import { describe, expect, it } from "vitest";

import { SOMA_ASSISTANT_INSTRUCTIONS, SOMA_ASSISTANT_PROMPT_VERSION } from "./prompt";

describe("Soma assistant coaching prompt", () => {
  it("requires professional reformulation and active objective clarification", () => {
    expect(SOMA_ASSISTANT_PROMPT_VERSION).toBe("soma-assistant-v1.11");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("appelle toujours getLatestRun");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("consulte getWorkoutHistory");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("running_distance_km");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("Ne reprends pas mécaniquement les mots");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("résultat observable");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("Pose une seule question décisive à la fois");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("langage de coaching professionnel");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("save_goal_set");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("manageNutritionTargets");
  });
});
