import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { onboardingSchema } from "@/domain/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const profileResult = await supabase.from("profiles").update({
    display_name: input.displayName,
    timezone: input.timezone,
    date_of_birth: input.dateOfBirth,
    height_cm: input.heightCm,
    weight_kg: input.weightKg,
    sex_for_health_calculations: input.sexForHealthCalculations,
    onboarding_completed_at: new Date().toISOString(),
    import_range: input.importRange,
  }).eq("user_id", user.id);

  if (profileResult.error) {
    return NextResponse.json({ error: "Profile could not be saved." }, { status: 500 });
  }

  const sleepResult = await supabase.from("sleep_preferences").update({
    base_target_minutes: input.baseSleepTargetMinutes,
    usual_wake_time: input.usualWakeTime,
  }).eq("user_id", user.id);

  if (sleepResult.error) {
    return NextResponse.json({ error: "Sleep preferences could not be saved." }, { status: 500 });
  }

  const { error: deleteGoalsError } = await supabase
    .from("health_goals")
    .delete()
    .eq("user_id", user.id)
    .is("ended_on", null);

  if (deleteGoalsError) {
    return NextResponse.json({ error: "Existing goals could not be updated." }, { status: 500 });
  }

  const goals = [
    { user_id: user.id, goal_type: input.primaryGoal, priority: 1 },
    ...(input.secondaryGoal
      ? [{ user_id: user.id, goal_type: input.secondaryGoal, priority: 2 }]
      : []),
  ];
  const { error: goalError } = await supabase.from("health_goals").insert(goals);

  if (goalError) {
    return NextResponse.json({ error: "Goals could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
