import { describe, expect, it } from "vitest";

import {
  assistantInstructionsForTurn,
  createAssistantTemporalContext,
  SOMA_ASSISTANT_INSTRUCTIONS,
  SOMA_ASSISTANT_PROMPT_VERSION,
} from "./prompt";

describe("Soma assistant coaching prompt", () => {
  it("requires professional reformulation and active objective clarification", () => {
    expect(SOMA_ASSISTANT_PROMPT_VERSION).toBe("soma-assistant-v1.14");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("appelle toujours getLatestRun");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("consulte getWorkoutHistory");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("running_distance_km");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("Ne reprends pas mécaniquement les mots");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("résultat observable");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("Pose une seule question décisive à la fois");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("langage de coaching professionnel");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("save_goal_set");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("manageNutritionTargets");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("Ne remplace jamais silencieusement l'activité demandée");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("hrv_ms");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("sleep_sessions");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("nutrition_daily");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("mesures utiles à la décision");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("score calculé par Soma");
    expect(SOMA_ASSISTANT_INSTRUCTIONS).toContain("moment de réévaluation");
  });

  it("formats a deterministic local clock for the current turn", () => {
    const temporalContext = createAssistantTemporalContext({
      now: new Date("2026-09-24T16:25:30.000Z"),
      profileTimezone: "Europe/Zurich",
    });

    expect(temporalContext).toEqual({
      instantUtc: "2026-09-24T16:25:30.000Z",
      localDate: "2026-09-24",
      localTime: "18:25:30",
      weekday: "jeudi",
      timezone: "Europe/Zurich",
      timezoneSource: "profile",
    });
    expect(assistantInstructionsForTurn(temporalContext)).toContain("Date locale : jeudi 2026-09-24");
    expect(assistantInstructionsForTurn(temporalContext)).toContain("Fuseau : Europe/Zurich (fuseau du profil)");
  });

  it("uses the application timezone when profile timezone is absent or invalid", () => {
    const missing = createAssistantTemporalContext({ now: new Date("2026-09-24T16:25:30.000Z"), profileTimezone: null });
    const invalid = createAssistantTemporalContext({ now: new Date("2026-09-24T16:25:30.000Z"), profileTimezone: "Not/A_Timezone" });

    expect(missing).toMatchObject({ timezone: "Europe/Paris", localDate: "2026-09-24", timezoneSource: "default" });
    expect(invalid).toMatchObject({ timezone: "Europe/Paris", localDate: "2026-09-24", timezoneSource: "default" });
    expect(assistantInstructionsForTurn()).toBe(SOMA_ASSISTANT_INSTRUCTIONS);
  });
});
