import { describe, expect, it } from "vitest";

import { assertJournalDayPersisted, buildCloudflareReadPlan, mergeJournalOmissions, serializeLabMatrixRevision } from "@/lib/cloudflare/db";

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
  it("is deterministic regardless of D1 group ordering", () => {
    const rows = [
      { table_name: "journal_days", row_count: 4, latest_update: "2026-08-25T10:00:00.000Z" },
      { table_name: "daily_health_metrics", row_count: 471, latest_update: "2026-08-25T09:00:00.000Z" },
    ];
    expect(serializeLabMatrixRevision(rows)).toBe(serializeLabMatrixRevision([...rows].reverse()));
  });

  it("changes when validated statistical inputs change", () => {
    const previous = serializeLabMatrixRevision([{ table_name: "validated_journal_days", row_count: 12, latest_update: "2026-08-24T10:00:00.000Z" }]);
    const next = serializeLabMatrixRevision([{ table_name: "validated_journal_days", row_count: 13, latest_update: "2026-08-25T10:00:00.000Z" }]);
    expect(next).not.toBe(previous);
  });
});
