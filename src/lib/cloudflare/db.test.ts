import { describe, expect, it, vi } from "vitest";

import { affectsLabMatrixRevision, assertJournalDayPersisted, buildCloudflareReadPlan, buildCloudflareUpdatePlan, createCloudflareAdminClient, labMatrixRevisionTables, mergeJournalOmissions, stableIdentity } from "@/lib/cloudflare/db";

describe("Cloudflare D1 row identity", () => {
  it("keeps idempotent sync jobs on the same connection-scoped row", () => {
    const row = {
      id: "job-1",
      connection_id: "connection-1",
      idempotency_key: "google-health-analytics-backfill-v1",
    };

    expect(decodeURIComponent(stableIdentity("sync_jobs", row))).toBe(JSON.stringify([
      ["connection_id", "connection-1"],
      ["idempotency_key", "google-health-analytics-backfill-v1"],
    ]));
  });

  it("keeps ordinary sync jobs identified by their id", () => {
    expect(decodeURIComponent(stableIdentity("sync_jobs", {
      id: "job-2",
      connection_id: "connection-1",
      idempotency_key: undefined,
    }))).toBe(JSON.stringify([["id", "job-2"]]));
  });

  it("keeps meal updates on the same slot-scoped row used at creation", () => {
    const meal = {
      id: "meal-1",
      user_id: "user-1",
      meal_date: "2026-09-05",
      meal_type: "breakfast",
      note: "2 bananes",
    };

    expect(stableIdentity("meals", meal)).toBe(
      stableIdentity("meals", meal, "user_id,meal_date,meal_type"),
    );
  });

  it("updates a meal row in place and moves its physical key with the slot", () => {
    const existing = { user_id: "user-1", id: "meal-1", meal_date: "2026-09-05", meal_type: "breakfast", note: "2 bananes" };
    const changed = { ...existing, meal_type: "lunch", updated_at: "2026-09-05T12:00:00.000Z" };
    const plan = buildCloudflareUpdatePlan("meals", existing, changed);

    expect(plan.sql).toContain("UPDATE soma_rows");
    expect(plan.bindings[0]).toBe(stableIdentity("meals", changed));
    expect(plan.bindings.at(-1)).toBe(stableIdentity("meals", existing));
  });

  it("keeps comparison filters when updating a row in the D1 compatibility path", () => {
    const plan = buildCloudflareUpdatePlan(
      "sync_jobs",
      { id: "job-1", started_at: "2026-09-15T10:00:00.000Z" },
      { id: "job-1", status: "queued" },
      [{ field: "started_at", operator: "lt", value: "2026-09-15T10:02:00.000Z" }],
    );

    expect(plan.sql).toContain("json_extract(json_data, '$.started_at') < ?");
    expect(plan.bindings).toContain("2026-09-15T10:02:00.000Z");
  });
});

describe("Cloudflare D1 read planning", () => {
  it("pushes simple filters, ordering, and pagination into D1", () => {
    const plan = buildCloudflareReadPlan({
      table: "health_records",
      filters: [
        { field: "user_id", operator: "eq", value: "user-1" },
        { field: "data_type", operator: "in", value: ["heart_rate", "sleep"] },
        { field: "civil_date", operator: "gte", value: "2026-01-01" },
      ],
      orFilterCount: 0,
      sorts: [{ field: "civil_date", ascending: false }],
      fromIndex: 20,
      toIndex: 39,
      maxRows: 50,
    });

    expect(plan.sql).toContain("user_id = ?");
    expect(plan.sql).toContain("json_extract(json_data, '$.data_type') IN (?, ?)");
    expect(plan.sql).toContain("json_extract(json_data, '$.civil_date') >= ?");
    expect(plan.sql).toContain("ORDER BY");
    expect(plan.sql).toContain("LIMIT ? OFFSET ?");
    expect(plan.bindings).toEqual(["health_records", "user-1", "heart_rate", "sleep", "2026-01-01", 20, 20]);
    expect(plan.paginationPushed).toBe(true);
  });

  it("keeps pagination in JavaScript when a filter cannot be represented exactly", () => {
    const plan = buildCloudflareReadPlan({
      table: "insights",
      filters: [{ field: "tags", operator: "contains", value: ["sleep"] }],
      orFilterCount: 0,
      sorts: [],
      fromIndex: 0,
      maxRows: 5,
    });

    expect(plan.sql).toBe("SELECT json_data FROM soma_rows WHERE table_name = ?");
    expect(plan.paginationPushed).toBe(false);
  });

  it("does not push inequality because missing JSON fields have different SQL semantics", () => {
    const plan = buildCloudflareReadPlan({
      table: "daily_scores",
      filters: [{ field: "kind", operator: "neq", value: "sleep" }],
      orFilterCount: 0,
      sorts: [],
      fromIndex: 0,
      maxRows: 5,
    });

    expect(plan.sql).toBe("SELECT json_data FROM soma_rows WHERE table_name = ?");
    expect(plan.paginationPushed).toBe(false);
  });

  it("rejects unsafe JSON field names from generated SQL", () => {
    const plan = buildCloudflareReadPlan({
      table: "daily_scores",
      filters: [{ field: "score_date') OR 1=1 --", operator: "eq", value: "2026-01-01" }],
      orFilterCount: 0,
      sorts: [],
      fromIndex: 0,
      maxRows: 1,
    });

    expect(plan.sql).not.toContain("OR 1=1");
    expect(plan.paginationPushed).toBe(false);
  });
});

describe("Supabase storage pagination", () => {
  it("increments the Personal Lab revision after deleting an analytical row", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      if (method === "DELETE") return new Response(null, { status: 204 });
      if (method === "POST") return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      const table = url.searchParams.get("table_name");
      if (table === "eq.meal_analyses") {
        return new Response(JSON.stringify([{
          table_name: "meal_analyses",
          row_key: "%5B%5B%22id%22%2C%22analysis-1%22%5D%5D",
          user_id: "user-1",
          json_data: { id: "analysis-1", user_id: "user-1", meal_id: "meal-1" },
          created_at: null,
          updated_at: null,
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify([{
        table_name: "lab_matrix_revisions",
        row_key: "%5B%5B%22user_id%22%2C%22user-1%22%5D%5D",
        user_id: "user-1",
        json_data: { user_id: "user-1", revision: 7 },
        created_at: null,
        updated_at: null,
      }]), { status: 200, headers: { "content-type": "application/json" } });
    });

    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await createCloudflareAdminClient().from("meal_analyses").delete().eq("user_id", "user-1").eq("id", "analysis-1");

      expect(result.error).toBeNull();
      const revisionWrite = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(revisionWrite).toBeDefined();
      const body = JSON.parse(String(revisionWrite?.[1]?.body));
      expect(body[0].json_data).toMatchObject({ user_id: "user-1", revision: 8 });
    } finally {
      vi.unstubAllGlobals();
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it("pushes health filters, repeated time bounds, ordering, and limits to Supabase", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("table_name")).toBe("eq.health_records");
      expect(url.searchParams.get("user_id")).toBe("eq.user-1");
      expect(url.searchParams.get("json_data->>data_type")).toBe("eq.heart-rate");
      expect(url.searchParams.getAll("json_data->>measured_at")).toEqual([
        "gte.2026-09-14T00:00:00.000Z",
        "lt.2026-09-15T00:00:00.000Z",
      ]);
      expect(url.searchParams.get("order")).toBe("json_data->>measured_at.desc");
      expect(url.searchParams.get("limit")).toBe("2000");
      expect(url.searchParams.get("offset")).toBeNull();
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });

    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await createCloudflareAdminClient()
        .from("health_records")
        .select("payload")
        .eq("user_id", "user-1")
        .eq("data_type", "heart-rate")
        .gte("measured_at", "2026-09-14T00:00:00.000Z")
        .lt("measured_at", "2026-09-15T00:00:00.000Z")
        .order("measured_at", { ascending: false })
        .limit(2_000);

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it("keeps the physical session key when a projected delete revokes a device session", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "DELETE") {
        expect(url.searchParams.get("token_hash")).toBe("eq.hashed-token");
        return new Response(null, { status: 204 });
      }
      expect(url.searchParams.get("user_id")).toBe("eq.user-1");
      expect(url.searchParams.get("session_id")).toBe("eq.session-1");
      expect(url.searchParams.get("select")).toBe("token_hash");
      return new Response(JSON.stringify([{ token_hash: "hashed-token" }]), { status: 200, headers: { "content-type": "application/json" } });
    });

    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await createCloudflareAdminClient().from("soma_sessions").delete().eq("user_id", "user-1").eq("session_id", "session-1").select("token_hash");
      expect(result.error).toBeNull();
      expect(result.data).toEqual([{ token_hash: "hashed-token" }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it("pushes compound OR date filters to Supabase instead of scanning all history", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("or")).toBe("(json_data->>civil_date.gte.2026-09-14,json_data->>end_time.gte.2026-09-14T00:00:00.000Z)");
      expect(url.searchParams.get("limit")).toBe("1000");
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });

    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await createCloudflareAdminClient()
        .from("health_records")
        .select("*")
        .eq("user_id", "user-1")
        .in("data_type", ["sleep", "exercise"])
        .or("civil_date.gte.2026-09-14,end_time.gte.2026-09-14T00:00:00.000Z")
        .order("id");

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it("reads logical rows beyond Supabase's first 1,000-row page", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset"));
      const page = offset === 0
        ? Array.from({ length: 1_000 }, (_, index) => ({ table_name: "daily_scores", row_key: String(index).padStart(4, "0"), user_id: "user-1", json_data: { id: String(index), user_id: "user-1", kind: "sleep" }, created_at: null, updated_at: null }))
        : [{ table_name: "daily_scores", row_key: "1000", user_id: "user-1", json_data: { id: "1000", user_id: "user-1", kind: "sleep" }, created_at: null, updated_at: null }];
      return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
    });

    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await createCloudflareAdminClient().from("daily_scores").select("*").eq("user_id", "user-1");

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1_001);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("offset")).toBe("0");
      expect(new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("offset")).toBe("1000");
    } finally {
      vi.unstubAllGlobals();
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });
});

describe("Cloudflare journal persistence verification", () => {
  it("updates omissions as a field patch until the complete validation snapshot", () => {
    expect(mergeJournalOmissions(["dinner", "reading"], [{ variable_id: "dinner", value: "22:30" }], false)).toEqual(["reading"]);
    expect(mergeJournalOmissions(["reading"], [{ variable_id: "dinner", value: null }], false)).toEqual(["reading", "dinner"]);
    expect(mergeJournalOmissions(["old"], [{ variable_id: "dinner", value: null }, { variable_id: "reading", value: true }], true)).toEqual(["dinner"]);
  });

  it("accepts the value read back for the selected date", () => {
    expect(() => assertJournalDayPersisted({
      entryDate: "2026-08-25",
      entries: [{ variable_id: "dinner", value: "22:30" }],
      persistedEntries: [{ variable_id: "dinner", entry_date: "2026-08-25", value: "22:30" }],
      persistedDay: { entry_date: "2026-08-25", status: "draft" },
      expectedStatus: "draft",
    })).not.toThrow();
  });

  it("rejects a value read back under another date", () => {
    expect(() => assertJournalDayPersisted({
      entryDate: "2026-08-25",
      entries: [{ variable_id: "dinner", value: "22:30" }],
      persistedEntries: [{ variable_id: "dinner", entry_date: "2026-08-26", value: "22:30" }],
      persistedDay: { entry_date: "2026-08-25", status: "draft" },
      expectedStatus: "draft",
    })).toThrow("selected date");
  });

  it("rejects an omitted value that still exists after deletion", () => {
    expect(() => assertJournalDayPersisted({
      entryDate: "2026-08-25",
      entries: [{ variable_id: "dinner", value: null }],
      persistedEntries: [{ variable_id: "dinner", entry_date: "2026-08-25", value: "22:30" }],
      persistedDay: { entry_date: "2026-08-25", status: "draft" },
      expectedStatus: "draft",
    })).toThrow("omitted journal value");
  });
});

describe("Personal Lab matrix revision", () => {
  it("centrally lists every statistical input table", () => {
    expect(labMatrixRevisionTables).toEqual([
      "profiles",
      "daily_health_metrics",
      "daily_scores",
      "daily_calendar_metrics",
      "daily_checkins",
      "meals",
      "meal_photos",
      "meal_analyses",
      "meal_feelings",
      "journal_variables",
      "journal_entries",
      "journal_days",
      "lab_metric_preferences",
    ]);
  });

  it("does not invalidate the matrix for unrelated product writes", () => {
    expect(affectsLabMatrixRevision("daily_health_metrics")).toBe(true);
    expect(affectsLabMatrixRevision("journal_entries")).toBe(true);
    expect(affectsLabMatrixRevision("meal_analyses")).toBe(true);
  });
});
