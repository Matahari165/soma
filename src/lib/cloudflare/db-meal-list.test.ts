import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  database: { prepare: vi.fn() },
  context: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: state.context }));

import { readMealListAggregate } from "./db";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  state.database.prepare.mockReset();
  state.context.mockReset().mockImplementation(() => ({ env: { SOMA_DB: state.database } }));
});

function enableSupabase(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubEnv("SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
  vi.stubGlobal("fetch", fetchMock);
}

describe("bounded meal aggregate reads", () => {
  it("loads one complete scalar JSON aggregate through the Supabase RPC", async () => {
    const rows = [{
      meal_row: { id: "meal-1", user_id: "synthetic-user", meal_date: "2026-09-15" },
      photo_rows: [{ id: "photo-1" }],
      feelings_row: null,
      latest_analysis_row: null,
      last_successful_analysis_row: null,
    }];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(rows), { status: 200 }));
    enableSupabase(fetchMock);

    await expect(readMealListAggregate("synthetic-user", "2026-09-01", "2026-09-30")).resolves.toEqual(rows);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://supabase.test/rest/v1/rpc/soma_meal_list_aggregate");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      p_user_id: "synthetic-user",
      p_from: "2026-09-01",
      p_to: "2026-09-30",
    });
  });

  it.each([
    { code: "PGRST202", message: "Could not find the function public.soma_meal_list_aggregate(p_from, p_to, p_user_id) in the schema cache" },
    { code: "42883", message: "function public.soma_meal_list_aggregate(text, text, text) does not exist" },
  ])("falls back only when PostgREST reports a missing RPC ($code)", async ({ code, message }) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code, message }), { status: 404 }));
    enableSupabase(fetchMock);

    await expect(readMealListAggregate("synthetic-user", "2026-09-01", "2026-09-30")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 403, code: "42501", message: "permission denied for function public.soma_meal_list_aggregate" },
    { status: 500, code: "57014", message: "canceling statement due to statement timeout" },
  ])("does not turn RPC errors into a legacy fallback ($message)", async ({ status, code, message }) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code, message }), { status }));
    enableSupabase(fetchMock);

    await expect(readMealListAggregate("synthetic-user", "2026-09-01", "2026-09-30")).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses one D1 statement with complete children and no row cap", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const meal = { id: "meal-1", user_id: "synthetic-user", meal_date: "2026-09-15" };
    const statement = {
      bind: vi.fn(),
      all: vi.fn(async () => ({
        success: true,
        results: [{
          meal_row: JSON.stringify(meal),
          photo_rows: JSON.stringify([{ id: "photo-1" }, { id: "photo-2" }]),
          feelings_row: null,
          latest_analysis_row: JSON.stringify({ id: "analysis-latest" }),
          last_successful_analysis_row: JSON.stringify({ id: "analysis-success" }),
        }],
      })),
    };
    statement.bind.mockReturnValue(statement);
    state.database.prepare.mockReturnValue(statement);

    await expect(readMealListAggregate("synthetic-user", "2026-09-01", "2026-09-30")).resolves.toEqual([{
      meal_row: meal,
      photo_rows: [{ id: "photo-1" }, { id: "photo-2" }],
      feelings_row: null,
      latest_analysis_row: { id: "analysis-latest" },
      last_successful_analysis_row: { id: "analysis-success" },
    }]);

    expect(state.database.prepare).toHaveBeenCalledOnce();
    expect(statement.bind).toHaveBeenCalledExactlyOnceWith("synthetic-user", "2026-09-01", "2026-09-30");
    expect(statement.all).toHaveBeenCalledOnce();
    const sql = String(state.database.prepare.mock.calls[0]?.[0]);
    expect(sql).toContain("child.table_name = 'meal_photos'");
    expect(sql).toContain("child.table_name = 'meal_feelings'");
    expect(sql).toContain("child.table_name = 'meal_analyses'");
    expect(sql).toContain("child.user_id = meal.user_id");
    expect(sql).toContain("json_type(child.json_data, '$.result') IN ('object', 'array')");
    expect(sql).not.toMatch(/LIMIT\s+\?\s+OFFSET/i);
  });

  it("does not issue an aggregate for an unbounded or invalid date range", async () => {
    vi.stubEnv("SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(readMealListAggregate("synthetic-user", "2026-09-01", undefined)).resolves.toBeNull();
    await expect(readMealListAggregate("synthetic-user", "2026-02-30", "2026-09-30")).resolves.toBeNull();
    await expect(readMealListAggregate("synthetic-user", "2026-09-30", "2026-09-01")).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.database.prepare).not.toHaveBeenCalled();
  });
});
