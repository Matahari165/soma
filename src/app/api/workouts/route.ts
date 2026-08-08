import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const exerciseInput = z.object({ exerciseId: z.string().uuid(), sets: z.number().int().min(1).max(20), repsMin: z.number().int().min(1).max(1000), repsMax: z.number().int().min(1).max(1000), restSeconds: z.number().int().min(0).max(3600) }).refine((value) => value.repsMax >= value.repsMin);
const programInput = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).optional(), exercises: z.array(exerciseInput).min(1).max(30) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const [{ data: exercises, error: exerciseError }, { data: programs, error: programError }] = await Promise.all([
    admin.from("exercise_library").select("id,name,muscle_groups,equipment,instructions,media_url,media_kind").or(`owner_user_id.is.null,owner_user_id.eq.${user.id}`).order("name").limit(500),
    admin.from("workout_programs").select("id,name,description,goal,active,workout_program_exercises(id,position,target_sets,target_reps_min,target_reps_max,rest_seconds,exercise_library(id,name,muscle_groups,equipment,instructions))").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100),
  ]);
  if (exerciseError || programError) return NextResponse.json({ error: "Workouts could not be loaded." }, { status: 500 });
  return NextResponse.json({ exercises: exercises ?? [], programs: programs ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = programInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the program name, exercises, sets, repetitions, and rest." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: program, error } = await admin.from("workout_programs").insert({ user_id: user.id, name: parsed.data.name, description: parsed.data.description ?? null }).select("id,name,description").single();
  if (error || !program) return NextResponse.json({ error: "Program could not be created." }, { status: 500 });
  const { error: exerciseError } = await admin.from("workout_program_exercises").insert(parsed.data.exercises.map((exercise, index) => ({ user_id: user.id, program_id: program.id, exercise_id: exercise.exerciseId, position: index, target_sets: exercise.sets, target_reps_min: exercise.repsMin, target_reps_max: exercise.repsMax, rest_seconds: exercise.restSeconds })));
  if (exerciseError) {
    await admin.from("workout_programs").delete().eq("id", program.id).eq("user_id", user.id);
    return NextResponse.json({ error: "Program exercises could not be saved." }, { status: 500 });
  }
  return NextResponse.json(program, { status: 201 });
}
