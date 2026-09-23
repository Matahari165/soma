import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { previewProfile } from "@/lib/local-preview";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

const profileSchema = z.object({ displayName: z.string().trim().min(1).max(80), dateOfBirth: z.iso.date(), heightCm: z.number().min(50).max(260), weightKg: z.number().min(20).max(400), primaryGoal: z.enum(["build_muscle", "improve_endurance", "improve_cardio", "general_fitness", "maintain_health", "other"]), baseSleepTargetMinutes: z.number().int().min(240).max(720), usualWakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), importRange: z.enum(["90_days", "all_history"]) });

export async function GET() {
  if (isLocalPreviewMode()) return NextResponse.json(previewProfile);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createCloudflareAdminClient();
  const results = await Promise.all([
    admin.from("profiles").select("display_name,date_of_birth,height_cm,weight_kg,import_range").eq("user_id", user.id).single(),
    admin.from("sleep_preferences").select("base_target_minutes,usual_wake_time").eq("user_id", user.id).single(),
    admin.from("health_goals").select("goal_type").eq("user_id", user.id).eq("priority", 1).is("ended_on", null).maybeSingle(),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("[api/profile] load failed", { code: failed.error.code });
    return NextResponse.json({ error: "Your profile could not be loaded." }, { status: 500 });
  }
  const [{ data: profile }, { data: sleep }, { data: goal }] = results;
  return NextResponse.json({ displayName: profile?.display_name ?? user.displayName, dateOfBirth: profile?.date_of_birth ?? "", heightCm: Number(profile?.height_cm ?? 175), weightKg: Number(profile?.weight_kg ?? 70), importRange: profile?.import_range ?? "90_days", primaryGoal: goal?.goal_type ?? "general_fitness", baseSleepTargetMinutes: 510, usualWakeTime: String(sleep?.usual_wake_time ?? "07:00").slice(0, 5) });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check every profile value." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json(parsed.data);
  const admin = createCloudflareAdminClient();
  const value = parsed.data;
  const { error } = await admin.rpc("update_soma_profile", {
    p_user_id: user.id,
    p_display_name: value.displayName,
    p_date_of_birth: value.dateOfBirth,
    p_height_cm: value.heightCm,
    p_weight_kg: value.weightKg,
    p_import_range: value.importRange,
    p_base_sleep_target_minutes: 510,
    p_usual_wake_time: value.usualWakeTime,
    p_primary_goal: value.primaryGoal,
  });
  if (error) return NextResponse.json({ error: "Profile could not be saved." }, { status: 500 });
  return NextResponse.json({ ...parsed.data, baseSleepTargetMinutes: 510 });
}
