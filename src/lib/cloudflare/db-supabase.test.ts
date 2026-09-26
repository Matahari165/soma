import { describe, expect, it, vi } from "vitest";
import { createSupabaseRequest, SupabaseQueryBuilder } from "./db-supabase";
import type { SupabaseRequest } from "./db-types";

describe("Supabase server projections", () => {
  it("projects selected JSON fields while retaining local fallback filter and sort inputs", async () => {
    const request = vi.fn(async (path: string) => {
      const params = new URL(path, "https://test/").searchParams;
      expect(params.get("select")).toBe("user_id,soma_field_id:json_data->id,soma_field_details:json_data->details,soma_field_tags:json_data->tags,soma_field_created_at:json_data->created_at");
      return [
        { user_id: "synthetic", soma_field_id: "ignored", soma_field_details: { value: 1 }, soma_field_tags: [], soma_field_created_at: "2026-01-01" },
        { user_id: "synthetic", soma_field_id: "kept", soma_field_details: { value: 2 }, soma_field_tags: ["sleep"], soma_field_created_at: "2026-01-02" },
      ];
    }) as unknown as SupabaseRequest;
    const result = await new SupabaseQueryBuilder(request, "insights").select("id,details(value)").contains("tags", ["sleep"]).order("created_at").limit(1);
    expect(result.data).toEqual([{ id: "kept", details: { value: 2 } }]);
  });

  it("returns exact HEAD counts without transferring JSON rows", async () => {
    const request = vi.fn() as unknown as SupabaseRequest;
    request.count = vi.fn(async (path: string) => {
      const params = new URL(path, "https://test/").searchParams;
      expect(params.get("json_data->>status")).toBe("eq.failed");
      expect(params.get("select")).toBe("row_key");
      expect(params.get("limit")).toBeNull();
      return 4001;
    });
    const result = await new SupabaseQueryBuilder(request, "meal_analyses").select("id", { count: "exact", head: true }).eq("status", "failed").limit(1);
    expect(result).toEqual({ data: null, error: null, count: 4001 });
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves unbounded local counts for unsupported filters", async () => {
    const request = vi.fn(async () => [{ user_id: "synthetic", soma_field_tags: ["sleep"] }, { user_id: "synthetic", soma_field_tags: [] }]) as unknown as SupabaseRequest;
    request.count = vi.fn();
    const result = await new SupabaseQueryBuilder(request, "insights").select("tags", { count: "exact", head: true }).contains("tags", ["sleep"]);
    expect(result.count).toBe(1);
    expect(request.count).not.toHaveBeenCalled();
  });

  it("reads the exact Content-Range count on the real transport", async () => {
    vi.stubEnv("SUPABASE_URL", "https://test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
      expect(init.method).toBe("HEAD");
      expect(new Headers(init.headers).get("Prefer")).toBe("count=exact");
      return new Response(null, { headers: { "content-range": "*/4500" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try { expect(await createSupabaseRequest().count!("soma_rows?select=row_key")).toBe(4500); }
    finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
});

describe("Supabase bounded multi-page reads", () => {
  it("keeps all requested rows above the REST page cap", async () => {
    const request = vi.fn(async (path: string) => {
      const params = new URL(path, "https://test/").searchParams;
      const from = Number(params.get("offset"));
      const limit = Number(params.get("limit"));
      return Array.from({ length: limit }, (_, i) => ({ user_id: "synthetic", soma_field_id: String(from + i) }));
    }) as unknown as SupabaseRequest;
    const result = await new SupabaseQueryBuilder(request, "health_records").select("id").range(20, 1519);
    expect(result.data).toHaveLength(1500);
    expect(result.data?.[0]).toEqual({ id: "20" });
    expect(result.data?.at(-1)).toEqual({ id: "1519" });
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("Sparse JSON compatibility", () => {
  it("preserves absent versus explicit null for strict local filters", async () => {
    const request = vi.fn(async (path: string) => {
      expect(new URL(path, "https://test/").searchParams.get("select")).toContain("json_data");
      return [
        { user_id: "synthetic", json_data: { id: "absent" } },
        { user_id: "synthetic", json_data: { id: "null", value: null } },
      ];
    }) as unknown as SupabaseRequest;
    const result = await new SupabaseQueryBuilder(request, "insights").select("id").neq("value", null);
    expect(result.data).toEqual([{ id: "absent" }]);
  });
});
