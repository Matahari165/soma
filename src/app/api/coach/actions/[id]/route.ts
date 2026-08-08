import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const decisionSchema = z.object({ decision: z.enum(["confirm", "reject"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ status: parsed.data.decision === "confirm" ? "executed in local preview" : "rejected" });
  const { id } = await context.params;
  const admin = createSupabaseAdminClient();
  if (parsed.data.decision === "reject") {
    const { data: rejected } = await admin.from("agent_action_proposals").update({ status: "rejected" }).eq("id", id).eq("user_id", user.id).eq("status", "proposed").select("id").maybeSingle();
    if (!rejected) return NextResponse.json({ error: "This preview is no longer available." }, { status: 409 });
    return NextResponse.json({ status: "rejected" });
  }
  const confirmedAt = new Date().toISOString();
  const { data: proposal } = await admin.from("agent_action_proposals").update({ status: "confirmed", confirmed_at: confirmedAt }).eq("id", id).eq("user_id", user.id).eq("status", "proposed").select("*").maybeSingle();
  if (!proposal) return NextResponse.json({ error: "This preview is no longer available." }, { status: 409 });
  try {
    const payload = proposal.arguments as Record<string, unknown>;
    if (proposal.tool_name === "create_workout_program") {
      const { data: program, error } = await admin.from("workout_programs").insert({ user_id: user.id, name: String(payload.programName ?? "Coach program") }).select("id").single();
      if (error || !program) throw new Error("Program could not be created.");
      const names = Array.isArray(payload.exerciseNames) ? payload.exerciseNames.map(String) : [];
      const { data: exercises } = await admin.from("exercise_library").select("id,name").in("name", names);
      if (!exercises?.length) {
        await admin.from("workout_programs").delete().eq("id", program.id).eq("user_id", user.id);
        throw new Error("No matching exercises were found.");
      }
      const { error: exerciseError } = await admin.from("workout_program_exercises").insert(exercises.map((exercise, index) => ({ user_id: user.id, program_id: program.id, exercise_id: exercise.id, position: index + 1, target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 })));
      if (exerciseError) {
        await admin.from("workout_programs").delete().eq("id", program.id).eq("user_id", user.id);
        throw new Error("Program exercises could not be saved.");
      }
    } else if (proposal.tool_name === "update_sleep_target") {
      const target = Number(payload.sleepTargetMinutes);
      if (!Number.isInteger(target) || target < 240 || target > 720) throw new Error("Sleep target is invalid.");
      const { error } = await admin.from("sleep_preferences").update({ base_target_minutes: target }).eq("user_id", user.id);
      if (error) throw new Error("Sleep target could not be updated.");
    } else if (proposal.tool_name === "update_primary_goal") {
      const allowed = ["build_muscle", "improve_endurance", "improve_cardio", "general_fitness", "maintain_health", "other"];
      const goal = String(payload.goal);
      if (!allowed.includes(goal)) throw new Error("Goal is invalid.");
      const { error: endGoalError } = await admin.from("health_goals").update({ ended_on: new Date().toISOString().slice(0, 10) }).eq("user_id", user.id).eq("priority", 1).is("ended_on", null);
      if (endGoalError) throw new Error("Current goal could not be closed.");
      const { error: goalError } = await admin.from("health_goals").insert({ user_id: user.id, goal_type: goal, priority: 1 });
      if (goalError) throw new Error("New goal could not be saved.");
    } else if (proposal.tool_name === "customize_dashboard") {
      const { data: current } = await admin.from("dashboard_layouts").select("layout").eq("user_id", user.id).single();
      const layout = (current?.layout ?? { widgets: [] }) as { widgets?: Array<{ id: string; visible: boolean }> };
      const widgetId = String(payload.widgetId ?? "");
      const widgets = (layout.widgets ?? []).map((widget) => widget.id === widgetId ? { ...widget, visible: Boolean(payload.visible) } : widget);
      if (!widgets.some((widget) => widget.id === widgetId)) throw new Error("Dashboard widget was not found.");
      const { error } = await admin.from("dashboard_layouts").update({ layout: { ...layout, widgets } }).eq("user_id", user.id);
      if (error) throw new Error("Dashboard layout could not be updated.");
    } else {
      throw new Error("This action type is not supported.");
    }
    await admin.from("agent_action_proposals").update({ status: "executed", executed_at: new Date().toISOString(), receipt: { executed: true, at: new Date().toISOString() } }).eq("id", id).eq("user_id", user.id).eq("status", "confirmed");
    return NextResponse.json({ status: "executed" });
  } catch (error) {
    await admin.from("agent_action_proposals").update({ status: "failed", receipt: { error: error instanceof Error ? error.message : "Action failed." } }).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed." }, { status: 500 });
  }
}
