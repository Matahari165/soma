import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { onboardingSchema } from "@/domain/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isLocalPreviewMode } from "@/lib/env";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the onboarding fields.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });

  const input = parsed.data;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("complete_soma_onboarding", {
    p_user_id: user.id,
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

  if (error) return NextResponse.json({ error: "Your profile could not be saved." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
