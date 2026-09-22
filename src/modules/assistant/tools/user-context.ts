import "server-only";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

import { loadConfirmedAssistantMemories, loadConfirmedGoalContext, loadPendingAssistantChanges } from "../repository";

function ageOn(dateOfBirth: string | null, now = new Date()) {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed = now.getUTCMonth() > birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

export async function loadAssistantUserContext(userId: string) {
  const admin = createCloudflareAdminClient();
  const [profileResult, legacyGoalsResult, goalContext, memories, pendingChanges] = await Promise.all([
    admin.from("profiles")
      .select("timezone,date_of_birth,height_cm,weight_kg,sex_for_health_calculations")
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("health_goals")
      .select("goal_type,priority,started_on,ended_on")
      .eq("user_id", userId)
      .is("ended_on", null)
      .order("priority", { ascending: true }),
    loadConfirmedGoalContext(userId),
    loadConfirmedAssistantMemories(userId),
    loadPendingAssistantChanges(userId),
  ]);

  if (profileResult.error) throw new Error("Assistant profile context could not be loaded.");
  if (legacyGoalsResult.error) throw new Error("Assistant goal context could not be loaded.");

  const profile = profileResult.data;
  return {
    profile: {
      timezone: profile?.timezone ?? "Europe/Paris",
      age: ageOn(profile?.date_of_birth ?? null),
      heightCm: profile?.height_cm === null || profile?.height_cm === undefined ? null : Number(profile.height_cm),
      weightKg: profile?.weight_kg === null || profile?.weight_kg === undefined ? null : Number(profile.weight_kg),
      sexForHealthCalculations: profile?.sex_for_health_calculations ?? null,
    },
    confirmedGoals: goalContext,
    legacyGoals: legacyGoalsResult.data ?? [],
    confirmedMemories: memories.map((memory) => ({
      kind: memory.kind,
      content: memory.content,
      structuredValue: memory.structured_value,
      sensitivity: memory.sensitivity,
      validFrom: memory.valid_from,
      validUntil: memory.valid_until,
    })),
    pendingChanges,
  };
}
