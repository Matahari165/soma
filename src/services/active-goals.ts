import "server-only";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { loadConfirmedGoalContext } from "@/modules/assistant/repository";

export const goalTypes = ["build_muscle", "improve_endurance", "improve_cardio", "general_fitness", "maintain_health", "other"] as const;
export type GoalType = (typeof goalTypes)[number];

function isGoalType(value: unknown): value is GoalType {
  return typeof value === "string" && goalTypes.some((goal) => goal === value);
}

// Older confirmed goal sets did not store their calculation category. Keep the
// fallback conservative; the human-readable direction remains authoritative.
export function goalTypeForDirection(direction: string): GoalType {
  const normalized = direction.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(muscl|masse musculaire|hypertroph|strength|muscle)/u.test(normalized)) return "build_muscle";
  if (/\b(endurance|distance|marathon|semi-marathon)/u.test(normalized)) return "improve_endurance";
  if (/\b(cardio|cardiovasculaire|aerobie)/u.test(normalized)) return "improve_cardio";
  if (/\b(sante|health)/u.test(normalized)) return "maintain_health";
  return "other";
}

export async function loadActiveGoal(userId: string): Promise<{ type: GoalType; direction: string; secondaryDirections: string[]; source: "assistant" | "profile" }> {
  const confirmed = await loadConfirmedGoalContext(userId);
  if (confirmed) {
    const { primary_direction: direction, primary_goal_type: category, secondary_directions: secondaryDirections } = confirmed.goalSet;
    return {
      type: isGoalType(category) ? category : goalTypeForDirection(direction),
      direction,
      secondaryDirections,
      source: "assistant",
    };
  }
  const result = await createCloudflareAdminClient().from("health_goals")
    .select("goal_type,custom_label")
    .eq("user_id", userId).eq("priority", 1).is("ended_on", null).maybeSingle();
  if (result.error) throw new Error("The current goal could not be loaded.");
  return {
    type: isGoalType(result.data?.goal_type) ? result.data.goal_type : "general_fitness",
    direction: result.data?.custom_label ?? "",
    secondaryDirections: [],
    source: "profile",
  };
}
