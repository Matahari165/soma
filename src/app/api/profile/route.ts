import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { previewProfile } from "@/lib/local-preview";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const profileSchema = z.object({ displayName: z.string().trim().min(1).max(80), dateOfBirth: z.iso.date(), heightCm: z.number().min(50).max(260), weightKg: z.number().min(20).max(400), primaryGoal: z.enum(["build_muscle", "improve_endurance", "improve_cardio", "general_fitness", "maintain_health", "other"]), baseSleepTargetMinutes: z.number().int().min(240).max(720), usualWakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), importRange: z.enum(["90_days", "all_history"]) });

export async function GET() {
  if (isLocalPreviewMode()) return NextResponse.json(previewProfile);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const [{ data: profile }, { data: sleep }, { data: goal }] = await Promise.all([
    admin.from("profiles").select("display_name,date_of_birth,height_cm,weight_kg,import_range").eq("user_id", user.id).single(),
    admin.from("sleep_preferences").select("base_target_minutes,usual_wake_time").eq("user_id", user.id).single(),
    admin.from("health_goals").select("goal_type").eq("user_id", user.id).eq("priority", 1).is("ended_on", null).maybeSingle(),
  ]);
  return NextResponse.json({ displayName: profile?.display_name ?? user.displayName, dateOfBirth: profile?.date_of_birth ?? "", heightCm: Number(profile?.height_cm ?? 175), weightKg: Number(profile?.weight_kg ?? 70), importRange: profile?.import_range ?? "90_days", primaryGoal: goal?.goal_type ?? "general_fitness", baseSleepTargetMinutes: sleep?.base_target_minutes ?? 480, usualWakeTime: String(sleep?.usual_wake_time ?? "07:00").slice(0, 5) });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check every profile value." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json(parsed.data);
  const admin = createSupabaseAdminClient();
  const value = parsed.data;
  const updates = await Promise.all([
    admin.from("profiles").update({ display_name: value.displayName, date_of_birth: value.dateOfBirth, height_cm: value.heightCm, weight_kg: value.weightKg, import_range: value.importRange }).eq("user_id", user.id),
    admin.from("sleep_preferences").update({ base_target_minutes: value.baseSleepTargetMinutes, usual_wake_time: value.usualWakeTime }).eq("user_id", user.id),
  ]);
  if (updates.some((result) => result.error)) return NextResponse.json({ error: "Profile could not be saved." }, { status: 500 });
  const { data: currentGoal } = await admin.from("health_goals").select("id,goal_type").eq("user_id", user.id).eq("priority", 1).is("ended_on", null).maybeSingle();
  if (currentGoal?.goal_type !== value.primaryGoal) {
    if (currentGoal) await admin.from("health_goals").update({ ended_on: new Date().toISOString().slice(0, 10) }).eq("id", currentGoal.id).eq("user_id", user.id);
    await admin.from("health_goals").insert({ user_id: user.id, goal_type: value.primaryGoal, priority: 1 });
  }
  return NextResponse.json(parsed.data);
}
