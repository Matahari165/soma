import "server-only";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

export async function loadRecentWorkoutHistory(userId: string, limit: number) {
  const admin = createCloudflareAdminClient();
  const { data: sessions, error: sessionError } = await admin.from("workout_sessions")
    .select("id,name,started_at,ended_at,duration_seconds,perceived_exertion")
    .eq("user_id", userId).eq("status", "completed")
    .order("ended_at", { ascending: false }).limit(limit);
  if (sessionError) throw new Error("Les séances n'ont pas pu être chargées.");
  if (!sessions?.length) return { source: "soma_workout_log" as const, sessions: [], complete: true };

  const setResults = await Promise.all(sessions.map((session) => admin.from("workout_session_sets")
    .select("session_id,exercise_id,exercise_position,set_index,target_reps,completed_reps,weight_kg,completed_at")
    .eq("user_id", userId).eq("session_id", session.id)
    .order("exercise_position", { ascending: true }).order("set_index", { ascending: true }).limit(201)));
  if (setResults.some((result) => result.error)) throw new Error("Les séries n'ont pas pu être chargées.");
  const complete = setResults.every((result) => (result.data?.length ?? 0) <= 200);
  const boundedSets = setResults.flatMap((result) => (result.data ?? []).slice(0, 200));
  const exerciseIds = [...new Set(boundedSets.map((set) => set.exercise_id))];
  let names = new Map<string, string>();
  if (exerciseIds.length) {
    const { data: exercises, error: exerciseError } = await admin.from("exercise_library")
      .select("id,name").in("id", exerciseIds).limit(1_000);
    if (exerciseError) throw new Error("Les noms des exercices n'ont pas pu être chargés.");
    names = new Map((exercises ?? []).map((exercise) => [exercise.id, exercise.name]));
  }

  return {
    source: "soma_workout_log" as const,
    complete,
    sessions: sessions.map((session) => ({
      name: session.name,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      durationSeconds: session.duration_seconds,
      perceivedExertion: session.perceived_exertion == null ? null : Number(session.perceived_exertion),
      sets: boundedSets.filter((set) => set.session_id === session.id).map((set) => ({
        exercise: names.get(set.exercise_id) ?? "Exercice non disponible",
        exercisePosition: set.exercise_position,
        setIndex: set.set_index,
        targetReps: set.target_reps,
        loggedReps: set.completed_reps,
        repsEvidence: "unverified_entry" as const,
        weightKg: set.weight_kg == null ? null : Number(set.weight_kg),
        completedAt: set.completed_at,
      })),
    })),
  };
}
