import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { previewExercises, previewProfile, previewPrograms } from "@/lib/local-preview";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

const exerciseInput = z.object({ exerciseId: z.string().uuid(), sets: z.number().int().min(1).max(20), repsMin: z.number().int().min(1).max(1000), repsMax: z.number().int().min(1).max(1000), restSeconds: z.number().int().min(0).max(3600) }).refine((value) => value.repsMax >= value.repsMin);
const programInput = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).optional(), exercises: z.array(exerciseInput).min(1).max(30) });

export async function GET() {
  if (isLocalPreviewMode()) return NextResponse.json({ exercises: previewExercises, programs: previewPrograms, primaryGoal: previewProfile.primaryGoal });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createCloudflareAdminClient();
  const [{ data: exercises, error: exerciseError }, { data: programs, error: programError }, { data: goal, error: goalError }] = await Promise.all([
    admin.from("exercise_library").select("id,name,muscle_groups,equipment,instructions,media_url,media_kind").or(`owner_user_id.is.null,owner_user_id.eq.${user.id}`).order("name").limit(500),
    admin.from("workout_programs").select("id,name,description,goal,active,workout_program_exercises(id,position,target_sets,target_reps_min,target_reps_max,rest_seconds,exercise_library(id,name,muscle_groups,equipment,instructions))").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100),
    admin.from("health_goals").select("goal_type").eq("user_id", user.id).eq("priority", 1).is("ended_on", null).maybeSingle(),
  ]);
  if (exerciseError || programError || goalError) return NextResponse.json({ error: "Workouts could not be loaded." }, { status: 500 });
  return NextResponse.json({ exercises: exercises ?? [], programs: programs ?? [], primaryGoal: goal?.goal_type ?? "general_fitness" });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = programInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the program name, exercises, sets, repetitions, and rest." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ id: crypto.randomUUID(), name: parsed.data.name, description: parsed.data.description ?? null }, { status: 201 });
  const admin = createCloudflareAdminClient();
  const { data: id, error } = await admin.rpc("create_soma_workout_program", {
    p_user_id: user.id,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_exercises: parsed.data.exercises,
  });
  if (error || !id) return NextResponse.json({ error: "Program could not be created." }, { status: 500 });
  return NextResponse.json({ id, name: parsed.data.name, description: parsed.data.description ?? null }, { status: 201 });
}
