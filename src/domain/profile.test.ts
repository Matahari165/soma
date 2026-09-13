import { describe, expect, it } from "vitest";

import { onboardingSchema } from "@/domain/profile";

const validOnboarding = {
  displayName: "Jérémy",
  dateOfBirth: "1999-08-19",
  heightCm: 178,
  weightKg: 72,
  sexForHealthCalculations: "male" as const,
  primaryGoal: "general_fitness" as const,
  secondaryGoal: "improve_endurance" as const,
  baseSleepTargetMinutes: 480,
  usualWakeTime: "07:00",
  importRange: "90_days" as const,
  timezone: "Europe/Paris",
};

describe("onboarding profile", () => {
  it("accepts two distinct health goals", () => {
    expect(onboardingSchema.safeParse(validOnboarding).success).toBe(true);
  });

  it("rejects a secondary goal that duplicates the primary goal", () => {
    const result = onboardingSchema.safeParse({
      ...validOnboarding,
      secondaryGoal: validOnboarding.primaryGoal,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.secondaryGoal).toContain("Choose a different secondary goal.");
    }
  });
});
