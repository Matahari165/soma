import { describe, expect, it } from "vitest";

import { buildCloudflareReadPlan } from "@/lib/cloudflare/db";

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
