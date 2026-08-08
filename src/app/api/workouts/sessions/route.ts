import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ programId: z.string().uuid(), name: z.string().min(1).max(120) });

export async function POST(request: Request) {
  if (isLocalPreviewMode()) return NextResponse.json({ id: crypto.randomUUID(), status: "active", preview: true }, { status: 201 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Session is invalid." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: program } = await admin.from("workout_programs").select("id,workout_program_exercises(exercise_id,position,target_sets,target_reps_min,rest_seconds)").eq("id", parsed.data.programId).eq("user_id", user.id).single();
  if (!program) return NextResponse.json({ error: "Program not found." }, { status: 404 });
  const { data: session, error } = await admin.from("workout_sessions").insert({ user_id: user.id, program_id: program.id, name: parsed.data.name, status: "active", started_at: new Date().toISOString() }).select("id").single();
  if (error || !session) return NextResponse.json({ error: "Session could not be started." }, { status: 500 });
  const setRows = program.workout_program_exercises.flatMap((exercise) => Array.from({ length: exercise.target_sets }, (_, setIndex) => ({ user_id: user.id, session_id: session.id, exercise_id: exercise.exercise_id, exercise_position: exercise.position, set_index: setIndex + 1, target_reps: exercise.target_reps_min, rest_seconds: exercise.rest_seconds })));
  if (!setRows.length) {
    await admin.from("workout_sessions").delete().eq("id", session.id).eq("user_id", user.id);
    return NextResponse.json({ error: "This program has no sets." }, { status: 400 });
  }
  const { error: setError } = await admin.from("workout_session_sets").insert(setRows);
  if (setError) {
    await admin.from("workout_sessions").delete().eq("id", session.id).eq("user_id", user.id);
    return NextResponse.json({ error: "Workout sets could not be prepared." }, { status: 500 });
  }
  return NextResponse.json({ id: session.id, status: "active" }, { status: 201 });
}
