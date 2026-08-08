import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["pause", "resume"]) }),
  z.object({ action: z.literal("complete"), durationSeconds: z.number().int().min(0), perceivedExertion: z.number().min(0).max(10).optional() }),
  z.object({ action: z.literal("complete_set"), exercisePosition: z.number().int().min(0), setIndex: z.number().int().min(1), completedReps: z.number().int().min(0).max(1000), weightKg: z.number().min(0).max(10000).nullable() }),
]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (isLocalPreviewMode()) {
    const body = await request.json().catch(() => ({})) as { action?: string };
    return NextResponse.json({ status: body.action === "complete" ? "completed" : body.action === "pause" ? "paused" : body.action === "resume" ? "active" : "saved", preview: true });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Session update is invalid." }, { status: 400 });
  const { id } = await context.params;
  const admin = createSupabaseAdminClient();
  if (parsed.data.action === "complete_set") {
    const { data, error } = await admin.from("workout_session_sets").update({ completed_reps: parsed.data.completedReps, weight_kg: parsed.data.weightKg, completed_at: new Date().toISOString() }).eq("session_id", id).eq("user_id", user.id).eq("exercise_position", parsed.data.exercisePosition).eq("set_index", parsed.data.setIndex).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: "Set could not be saved." }, { status: 500 });
    return data ? NextResponse.json({ status: "saved" }) : NextResponse.json({ error: "Set not found." }, { status: 404 });
  }
  const values = parsed.data.action === "complete" ? { status: "completed", ended_at: new Date().toISOString(), duration_seconds: parsed.data.durationSeconds, perceived_exertion: parsed.data.perceivedExertion ?? null } : { status: parsed.data.action === "pause" ? "paused" : "active" };
  const { data, error } = await admin.from("workout_sessions").update(values).eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Session could not be updated." }, { status: 500 });
  return data ? NextResponse.json({ status: values.status }) : NextResponse.json({ error: "Session not found." }, { status: 404 });
}
