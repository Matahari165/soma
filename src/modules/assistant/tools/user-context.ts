import "server-only";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { assistantPlanBodySchema } from "../contracts";

import { loadActiveAssistantPlans, loadAssistantPlansNeedingReview, loadConfirmedAssistantMemories, loadConfirmedGoalContext, loadPendingAssistantChanges } from "../repository";

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

function todayInTimezone(timezone: string, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export async function loadAssistantUserContext(userId: string) {
  const admin = createCloudflareAdminClient();
  const profileResult = await admin.from("profiles")
    .select("timezone,date_of_birth,height_cm,weight_kg,sex_for_health_calculations")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileResult.error) throw new Error("Assistant profile context could not be loaded.");
  const profile = profileResult.data;
  const timezone = profile?.timezone ?? "Europe/Paris";
  const today = todayInTimezone(timezone);
  const [goalContext, memories, pendingChanges, plans, plansNeedingReview] = await Promise.all([
    loadConfirmedGoalContext(userId),
    loadConfirmedAssistantMemories(userId, today),
    loadPendingAssistantChanges(userId),
    loadActiveAssistantPlans(userId),
    loadAssistantPlansNeedingReview(userId),
  ]);

  const legacyGoalsResult = goalContext ? null : await admin.from("health_goals")
    .select("goal_type,priority,starts_on,ended_on")
    .eq("user_id", userId)
    .is("ended_on", null)
    .order("priority", { ascending: true });
  if (legacyGoalsResult?.error) throw new Error("Assistant goal context could not be loaded.");

  return {
    profile: {
      timezone,
      age: ageOn(profile?.date_of_birth ?? null),
      heightCm: profile?.height_cm === null || profile?.height_cm === undefined ? null : Number(profile.height_cm),
      weightKg: profile?.weight_kg === null || profile?.weight_kg === undefined ? null : Number(profile.weight_kg),
      sexForHealthCalculations: profile?.sex_for_health_calculations ?? null,
    },
    confirmedGoals: goalContext,
    // The older profile goal is only a seed before the first confirmed coach goal.
    legacyGoals: legacyGoalsResult?.data ?? [],
    confirmedMemories: memories.slice(0, 100).map((memory) => ({
      kind: memory.kind,
      content: memory.content,
      structuredValue: memory.structured_value,
      sensitivity: memory.sensitivity,
      validFrom: memory.valid_from,
      validUntil: memory.valid_until,
    })),
    confirmedMemoriesComplete: memories.length <= 100,
    activePlans: plans.activePlans.map((plan) => {
      const parsed = assistantPlanBodySchema.safeParse(plan.confirmedVersion?.body);
      return {
        id: plan.id,
        goalSetId: plan.goal_set_id,
        version: plan.confirmedVersion?.version ?? null,
        confirmedAt: plan.confirmedVersion?.confirmed_at ?? null,
        status: parsed.success ? "confirmed" : "missing_or_invalid_version",
        title: parsed.success ? parsed.data.title : null,
        objectiveSummary: parsed.success ? parsed.data.objectiveSummary : null,
        detailedThrough: parsed.success ? parsed.data.detailedThrough : null,
        reviewOn: parsed.success ? parsed.data.reviewOn : null,
        sections: parsed.success ? parsed.data.sections.map((section, index) => ({ index, domain: section.domain, title: section.title, itemCount: section.content.length })) : [],
      };
    }),
    activePlansComplete: plans.complete,
    plansNeedingReview: plansNeedingReview.slice(0, 10),
    plansNeedingReviewComplete: plansNeedingReview.length <= 10,
    pendingChanges,
  };
}
