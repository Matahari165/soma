import { beforeEach, expect, it, vi } from "vitest";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { loadRecentWorkoutHistory } from "./workout-history";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: vi.fn() }));

const userId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => vi.clearAllMocks());

it("reads only the owner's completed session and preserves a missing load separately from zero", async () => {
  const filters: Array<[string, unknown]> = [];
  const rows: Record<string, unknown[]> = {
    workout_sessions: [{ id: "session-1", name: "Séance A", started_at: "2026-09-20T08:00:00Z", ended_at: "2026-09-20T09:00:00Z", duration_seconds: 3600, perceived_exertion: null }],
    workout_session_sets: [
      { session_id: "session-1", exercise_id: "exercise-1", exercise_position: 0, set_index: 1, target_reps: 8, completed_reps: 7, weight_kg: null, completed_at: "2026-09-20T08:20:00Z" },
      { session_id: "session-1", exercise_id: "exercise-1", exercise_position: 0, set_index: 2, target_reps: 8, completed_reps: 8, weight_kg: 0, completed_at: "2026-09-20T08:23:00Z" },
    ],
    exercise_library: [{ id: "exercise-1", name: "Squat" }],
  };
  vi.mocked(createCloudflareAdminClient).mockReturnValue({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
        in: () => query,
        order: () => query,
        limit: async () => ({ data: rows[table], error: null }),
      };
      return query;
    },
  } as never);

  const result = await loadRecentWorkoutHistory(userId, 1);
  expect(filters).toContainEqual(["user_id", userId]);
  expect(filters.filter(([column]) => column === "user_id")).toHaveLength(2);
  expect(filters).toContainEqual(["status", "completed"]);
  expect(result.sessions[0].sets).toEqual([
    expect.objectContaining({ exercise: "Squat", completedReps: 7, weightKg: null }),
    expect.objectContaining({ exercise: "Squat", completedReps: 8, weightKg: 0 }),
  ]);
  expect(result.complete).toBe(true);
});

it("reports no session without inventing a zero-valued workout", async () => {
  vi.mocked(createCloudflareAdminClient).mockReturnValue({
    from: () => {
      const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: [], error: null }) };
      return query;
    },
  } as never);
  await expect(loadRecentWorkoutHistory(userId, 1)).resolves.toEqual({ source: "soma_workout_log", sessions: [], complete: true });
});
