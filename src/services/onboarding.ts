import type { OnboardingInput } from "@/domain/profile";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { ensureJournalVariables } from "@/services/journal";

export type CompleteOnboardingResult =
  | { ok: true; preview?: true }
  | { ok: false; error: string; status: 500 };

export async function completeOnboarding(userId: string, input: OnboardingInput): Promise<CompleteOnboardingResult> {
  if (isLocalPreviewMode()) return { ok: true, preview: true };

  const admin = createCloudflareAdminClient();
  const { error } = await admin.rpc("complete_soma_onboarding", {
    p_user_id: userId,
    p_display_name: input.displayName,
    p_timezone: input.timezone,
    p_date_of_birth: input.dateOfBirth,
    p_height_cm: input.heightCm,
    p_weight_kg: input.weightKg,
    p_sex_for_health_calculations: input.sexForHealthCalculations,
    p_import_range: input.importRange,
    p_base_sleep_target_minutes: input.baseSleepTargetMinutes,
    p_usual_wake_time: input.usualWakeTime,
    p_primary_goal: input.primaryGoal,
    p_secondary_goal: input.secondaryGoal,
  });

  if (error) return { ok: false, error: "Your profile could not be saved.", status: 500 };

  try {
    await ensureJournalVariables(userId, {
      selectedHabitNames: input.selectedHabits,
      customHabits: input.customHabits,
    });
  } catch {
    return { ok: false, error: "Your profile was saved, but the journal could not be initialized.", status: 500 };
  }

  return { ok: true };
}
