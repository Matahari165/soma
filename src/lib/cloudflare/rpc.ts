/* eslint-disable @typescript-eslint/no-explicit-any -- RPC payloads mirror the former database function API. */

import { createCloudflareAdminClient, saveCloudflareJournalDay } from "@/lib/cloudflare/db";

type Row = Record<string, any>;
type Result = { data: any; error: { message: string; code?: string } | null };

export async function executeCloudflareRpc(name: string, input: Row): Promise<Result> {
  try {
    const client = createCloudflareAdminClient();

    if (name === "complete_soma_onboarding") {
      if (input.p_secondary_goal && input.p_secondary_goal === input.p_primary_goal) throw new Error("Secondary goal must differ from primary goal.");
      await client.from("profiles").upsert({
        user_id: input.p_user_id,
        display_name: input.p_display_name,
        timezone: input.p_timezone,
        date_of_birth: input.p_date_of_birth,
        height_cm: input.p_height_cm,
        weight_kg: input.p_weight_kg,
        sex_for_health_calculations: input.p_sex_for_health_calculations,
        onboarding_completed_at: new Date().toISOString(),
        import_range: input.p_import_range,
      }, { onConflict: "user_id" });
      await client.from("sleep_preferences").upsert({
        user_id: input.p_user_id,
        base_target_minutes: input.p_base_sleep_target_minutes,
        usual_wake_time: input.p_usual_wake_time,
        wind_down_minutes: 30,
      }, { onConflict: "user_id" });
      await client.from("health_goals").update({ ended_on: new Date().toISOString().slice(0, 10) }).eq("user_id", input.p_user_id).is("ended_on", null);
      const goals = [{ user_id: input.p_user_id, goal_type: input.p_primary_goal, priority: 1 }];
      if (input.p_secondary_goal) goals.push({ user_id: input.p_user_id, goal_type: input.p_secondary_goal, priority: 2 });
      await client.from("health_goals").insert(goals);
      return { data: null, error: null };
    }

    if (name === "update_soma_profile") {
      await client.from("profiles").update({
        display_name: input.p_display_name,
        date_of_birth: input.p_date_of_birth,
        height_cm: input.p_height_cm,
        weight_kg: input.p_weight_kg,
        import_range: input.p_import_range,
      }).eq("user_id", input.p_user_id);
      await client.from("sleep_preferences").upsert({
        user_id: input.p_user_id,
        base_target_minutes: input.p_base_sleep_target_minutes,
        usual_wake_time: input.p_usual_wake_time,
      }, { onConflict: "user_id" });
      const { data: current } = await client.from("health_goals").select("id,goal_type").eq("user_id", input.p_user_id).eq("priority", 1).is("ended_on", null).maybeSingle();
      if (!current || current.goal_type !== input.p_primary_goal) {
        await client.from("health_goals").update({ ended_on: new Date().toISOString().slice(0, 10) }).eq("user_id", input.p_user_id).eq("priority", 1).is("ended_on", null);
        await client.from("health_goals").insert({ user_id: input.p_user_id, goal_type: input.p_primary_goal, priority: 1 });
      }
      return { data: null, error: null };
    }

    if (name === "save_personal_lab_journal_day") {
      const entries = Array.isArray(input.p_entries) ? input.p_entries : [];
      await saveCloudflareJournalDay({ userId: input.p_user_id, entryDate: input.p_entry_date, entries, validate: Boolean(input.p_validate), replaceOmissions: Boolean(input.p_replace_omissions) });
      return { data: null, error: null };
    }

    if (name === "create_soma_workout_program") {
      const exercises = Array.isArray(input.p_exercises) ? input.p_exercises : [];
      if (!exercises.length) return { data: null, error: { message: "Program exercises are required.", code: "22023" } };
      const libraries = await Promise.all(exercises.map((exercise: Row) => client.from("exercise_library").select("id").eq("id", exercise.exerciseId).maybeSingle()));
      if (libraries.some((result) => !result.data)) return { data: null, error: { message: "One or more exercises are unavailable.", code: "22023" } };
      const programId = crypto.randomUUID();
      await client.from("workout_programs").insert({ id: programId, user_id: input.p_user_id, name: input.p_name, description: input.p_description, active: true });
      await client.from("workout_program_exercises").insert(exercises.map((exercise: Row, position: number) => ({
        user_id: input.p_user_id,
        program_id: programId,
        exercise_id: exercise.exerciseId,
        position,
        target_sets: exercise.sets,
        target_reps_min: exercise.repsMin,
        target_reps_max: exercise.repsMax,
        rest_seconds: exercise.restSeconds,
      })));
      return { data: programId, error: null };
    }

    if (name === "start_soma_workout_session") {
      const { data: program } = await client.from("workout_programs").select("id").eq("id", input.p_program_id).eq("user_id", input.p_user_id).eq("active", true).maybeSingle();
      if (!program) return { data: null, error: { message: "Program not found.", code: "P0002" } };
      const { data: exercises } = await client.from("workout_program_exercises").select("*").eq("program_id", input.p_program_id).eq("user_id", input.p_user_id).order("position");
      if (!exercises?.length) return { data: null, error: { message: "Program has no sets.", code: "22023" } };
      const sessionId = crypto.randomUUID();
      await client.from("workout_sessions").insert({ id: sessionId, user_id: input.p_user_id, program_id: input.p_program_id, name: input.p_name, status: "active", started_at: new Date().toISOString() });
      await client.from("workout_session_sets").insert(exercises.flatMap((exercise: Row) => Array.from({ length: exercise.target_sets }, (_, index) => ({
        user_id: input.p_user_id,
        session_id: sessionId,
        exercise_id: exercise.exercise_id,
        exercise_position: exercise.position,
        set_index: index + 1,
        target_reps: exercise.target_reps_min,
        rest_seconds: exercise.rest_seconds,
      }))));
      return { data: sessionId, error: null };
    }

    if (name === "reconcile_google_health_window") {
      const { data: staged, error } = await client.from("google_health_reconciliation_stage").select("*").eq("reconciliation_token", input.p_reconciliation_token).eq("user_id", input.p_user_id).eq("data_type", input.p_data_type);
      if (error) return { data: null, error };
      const startDate = String(input.p_window_start).slice(0, 10);
      const endDate = String(input.p_window_end).slice(0, 10);
      const existingQuery = client.from("health_records").select("*").eq("user_id", input.p_user_id).eq("provider", "google_health").eq("data_type", input.p_data_type);
      const { data: existing } = input.p_date_based
        ? await existingQuery.gte("civil_date", startDate).lt("civil_date", endDate)
        : await existingQuery.gte("start_time", input.p_window_start).lt("start_time", input.p_window_end);
      const incomingIds = new Set((staged ?? []).map((row: Row) => row.source_record_id));
      for (const row of existing ?? []) if (!incomingIds.has(row.source_record_id)) await client.from("health_records").delete().eq("id", row.id);
      if (staged?.length) await client.from("health_records").upsert(staged.map((row: Row) => ({ ...row, reconciliation_token: undefined, job_id: undefined })), { onConflict: "user_id,provider,data_type,source_record_id" });
      await client.from("google_health_reconciliation_stage").delete().eq("reconciliation_token", input.p_reconciliation_token).eq("user_id", input.p_user_id).eq("data_type", input.p_data_type);
      return { data: (existing ?? []).filter((row: Row) => !incomingIds.has(row.source_record_id)).length, error: null };
    }

    if (name === "reclaim_verified_health_archive") {
      const { data: archive } = await client.from("health_record_archives").select("*").eq("id", input.p_archive_id).maybeSingle();
      if (!archive || !archive.verified_at) return { data: 0, error: null };
      const { data: rows } = await client.from("health_records").select("id").eq("user_id", archive.user_id).eq("provider", archive.provider).eq("data_type", archive.data_type).gte("measured_at", archive.range_start).lt("measured_at", archive.range_end);
      for (const row of rows ?? []) await client.from("health_records").delete().eq("id", row.id);
      await client.from("health_record_archives").update({ reclaimed_at: new Date().toISOString() }).eq("id", archive.id);
      return { data: rows?.length ?? 0, error: null };
    }

    return { data: null, error: { message: `Unsupported Cloudflare operation: ${name}` } };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "Cloudflare transaction failed." } };
  }
}
