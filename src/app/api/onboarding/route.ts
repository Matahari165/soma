import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { onboardingSchema } from "@/domain/profile";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Vérifiez les informations saisies.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });

  const input = parsed.data;
  const admin = createCloudflareAdminClient();
  const { error } = await admin.rpc("complete_soma_onboarding", {
    p_user_id: user.id,
    p_display_name: input.displayName,
    p_timezone: input.timezone,
    p_date_of_birth: input.dateOfBirth,
    p_height_cm: input.heightCm,
    p_weight_kg: input.weightKg,
    p_sex_for_health_calculations: input.sexForHealthCalculations,
    p_import_range: input.importRange,
    p_base_sleep_target_minutes: 510,
    p_usual_wake_time: input.usualWakeTime,
    p_primary_goal: input.primaryGoal,
    p_secondary_goal: input.secondaryGoal,
  });

  if (error) return NextResponse.json({ error: "Votre profil n’a pas pu être enregistré." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
