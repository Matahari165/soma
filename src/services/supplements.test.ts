import { afterEach, describe, expect, it, vi } from "vitest";

const d1State = vi.hoisted(() => ({
  inserted: null as { sql: string; bindings: unknown[] } | null,
  rows: [] as Array<{ json_data: string }>,
}));

vi.mock("@/lib/cloudflare/db", () => ({
  stableIdentity: (_table: string, row: { id: string }) => encodeURIComponent(JSON.stringify([["id", row.id]])),
  cloudflareDb: () => ({
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async run() {
          if (sql.startsWith("INSERT INTO")) d1State.inserted = { sql, bindings };
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() {
          return { success: true, results: d1State.rows as T[] };
        },
        async first<T>() {
          return null as T | null;
        },
      };
    },
  }),
}));

import { clearPreviewSupplements, createSupplementDefinition, createSupplementEntry, deleteSupplementEntry, listSupplementDefinitions, listSupplementEntries, updateSupplementEntry } from "./supplements";

describe("supplement service preview", () => {
  const userId = "supplement-test-user";

  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
    clearPreviewSupplements(userId);
    d1State.inserted = null;
    d1State.rows = [];
  });

  it("keeps a planned dose distinct from the recorded dose", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const definition = await createSupplementDefinition(userId, {
      productName: "Whey test",
      category: "protein",
      source: "product_label",
      serving: { quantity: 30, unit: "g", label: "1 dose" },
      nutrients: [{ key: "protein", label: "Protéines", amount: 24, unit: "g" }],
      frequency: { kind: "daily", timesPerDay: 1 },
    });
    const entry = await createSupplementEntry(userId, { definitionId: definition.id, entryDate: "2026-09-12", planned: { servings: 1 } });
    expect(entry.actual).toMatchObject({ status: "not_recorded", servings: null });
    expect((await listSupplementEntries(userId))[0].planned.servings).toBe(1);
    const taken = await updateSupplementEntry(userId, entry.id, { actual: { status: "taken", servings: 0.5, takenAt: "2026-09-12T10:00:00+02:00" } });
    expect(taken.planned.servings).toBe(1);
    expect(taken.actual).toMatchObject({ status: "taken", servings: 0.5 });
    expect(await deleteSupplementEntry(userId, entry.id)).toBe(true);
  });

  it("serializes and deserializes nested JSON rows through soma_rows", async () => {
    delete process.env.SOMA_LOCAL_PREVIEW;
    const definition = await createSupplementDefinition("d1-user", {
      productName: "Magnésium D1",
      category: "vitamin_mineral",
      source: "product_label",
      serving: { quantity: 2, unit: "capsule", label: "2 gélules" },
      nutrients: [{ key: "magnesium", label: "Magnésium", amount: 200, unit: "mg" }],
      frequency: { kind: "daily", timesPerDay: 1 },
    });
    expect(d1State.inserted?.sql).toContain("INSERT INTO soma_rows");
    expect(d1State.inserted?.bindings[0]).toBe("supplement_definitions");
    expect(d1State.inserted?.bindings[2]).toBe("d1-user");
    const stored = JSON.parse(String(d1State.inserted?.bindings[3])) as Record<string, unknown>;
    expect(stored).toMatchObject({ user_id: "d1-user", product_name: "Magnésium D1", nutrients: [{ key: "magnesium", amount: 200, unit: "mg" }] });
    expect(stored.userId).toBeUndefined();

    d1State.rows = [{ json_data: JSON.stringify(stored) }];
    const loaded = await listSupplementDefinitions("d1-user");
    expect(loaded[0]).toMatchObject({ id: definition.id, userId: "d1-user", nutrients: [{ label: "Magnésium", amount: 200 }] });
  });
});
